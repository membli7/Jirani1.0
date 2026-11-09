-- Append-only, lifetime receipt-reference reservations shared by all financial record types.
-- Original entered values remain in their source rows; this table stores only normalized keys.

CREATE TABLE IF NOT EXISTS public.financial_reference_reservations (
  chama_id UUID NOT NULL REFERENCES public.chamas(chama_id) ON DELETE CASCADE,
  normalized_reference TEXT NOT NULL CHECK (
    normalized_reference <> ''
    AND normalized_reference = pg_catalog.lower(pg_catalog.btrim(normalized_reference))
  ),
  source_record_key TEXT NOT NULL CHECK (source_record_key <> ''),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_reference_reservations_pkey PRIMARY KEY (chama_id, normalized_reference)
);

COMMENT ON TABLE public.financial_reference_reservations IS
  'Append-only chama-scoped receipt keys; normalized for comparison while original values remain in financial source rows.';

ALTER TABLE public.financial_reference_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reference_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.financial_reference_reservations;
CREATE POLICY tenant_isolation ON public.financial_reference_reservations
  USING (chama_id = public.app_current_chama_id())
  WITH CHECK (chama_id = public.app_current_chama_id());

-- Build a tenant-local candidate set so the migration can validate existing data under RLS.
CREATE TEMP TABLE financial_reference_backfill_candidates (
  chama_id UUID NOT NULL,
  normalized_reference TEXT NOT NULL,
  source_record_key TEXT NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  tenant_row RECORD;
BEGIN
  FOR tenant_row IN
    SELECT tenant_id FROM public.app_chama_directory ORDER BY record_order
  LOOP
    PERFORM pg_catalog.set_config('app.chama_id', tenant_row.tenant_id::text, true);
    DELETE FROM pg_temp.financial_reference_backfill_candidates;

    INSERT INTO pg_temp.financial_reference_backfill_candidates (chama_id, normalized_reference, source_record_key)
    SELECT t.chama_id, pg_catalog.lower(pg_catalog.btrim(t.reference_number)), 'transaction:' || t.source_id
    FROM public.transactions t
    WHERE t.chama_id = tenant_row.tenant_id
      AND t.reference_number IS NOT NULL AND pg_catalog.btrim(t.reference_number) <> ''
    UNION ALL
    SELECT c.chama_id, pg_catalog.lower(pg_catalog.btrim(c.reference_number)), 'transaction:' || c.source_id
    FROM public.contributions c
    WHERE c.chama_id = tenant_row.tenant_id
      AND c.reference_number IS NOT NULL AND pg_catalog.btrim(c.reference_number) <> ''
    UNION ALL
    SELECT r.chama_id, pg_catalog.lower(pg_catalog.btrim(r.reference_number)), 'transaction:' || r.source_id
    FROM public.loan_repayments r
    WHERE r.chama_id = tenant_row.tenant_id
      AND r.reference_number IS NOT NULL AND pg_catalog.btrim(r.reference_number) <> ''
    UNION ALL
    SELECT m.chama_id,
           pg_catalog.lower(pg_catalog.btrim(m.mpesa_receipt_number)),
           CASE WHEN t.source_id IS NOT NULL THEN 'transaction:' || t.source_id ELSE 'mpesa_callback:' || m.source_id END
    FROM public.mpesa_callbacks m
    LEFT JOIN public.transactions t ON t.id = m.transaction_id AND t.chama_id = m.chama_id
    WHERE m.chama_id = tenant_row.tenant_id
      AND m.mpesa_receipt_number IS NOT NULL AND pg_catalog.btrim(m.mpesa_receipt_number) <> '';

    IF EXISTS (
      SELECT 1
      FROM pg_temp.financial_reference_backfill_candidates
      GROUP BY chama_id, normalized_reference
      HAVING count(DISTINCT source_record_key) > 1
    ) THEN
      RAISE EXCEPTION 'Existing normalized receipt-reference collisions found; resolve them before applying this migration.'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_temp.financial_reference_backfill_candidates candidate
      JOIN public.financial_reference_reservations existing
        ON existing.chama_id = candidate.chama_id
       AND existing.normalized_reference = candidate.normalized_reference
      WHERE existing.source_record_key IS DISTINCT FROM candidate.source_record_key
    ) THEN
      RAISE EXCEPTION 'An existing receipt reservation belongs to a different financial record; migration stopped without changing it.'
        USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.financial_reference_reservations (chama_id, normalized_reference, source_record_key)
    SELECT DISTINCT chama_id, normalized_reference, source_record_key
    FROM pg_temp.financial_reference_backfill_candidates
    ON CONFLICT (chama_id, normalized_reference) DO NOTHING;
  END LOOP;
END;
$$;

-- Replace the older global, case-sensitive provider index with the same per-chama normalized scope.
DROP INDEX IF EXISTS public.mpesa_callbacks_receipt_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_mpesa_callbacks_receipt_number_unique
  ON public.mpesa_callbacks (chama_id, pg_catalog.lower(pg_catalog.btrim(mpesa_receipt_number)))
  WHERE mpesa_receipt_number IS NOT NULL AND pg_catalog.btrim(mpesa_receipt_number) <> '';

CREATE OR REPLACE FUNCTION public.reserve_transaction_receipt_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized TEXT;
  owner_key TEXT;
  reserved_owner TEXT;
BEGIN
  normalized := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.reference_number, '')));
  IF normalized = '' THEN RETURN NEW; END IF;
  IF NEW.chama_id IS DISTINCT FROM public.app_current_chama_id() THEN
    RAISE EXCEPTION 'Receipt reservation must match the active chama.' USING ERRCODE = '42501';
  END IF;

  owner_key := 'transaction:' || NEW.source_id;
  INSERT INTO public.financial_reference_reservations (chama_id, normalized_reference, source_record_key)
  VALUES (NEW.chama_id, normalized, owner_key)
  ON CONFLICT (chama_id, normalized_reference) DO NOTHING;

  SELECT source_record_key INTO reserved_owner
  FROM public.financial_reference_reservations
  WHERE chama_id = NEW.chama_id AND normalized_reference = normalized;
  IF reserved_owner IS DISTINCT FROM owner_key THEN
    RAISE EXCEPTION 'Receipt reference is already reserved in this chama.'
      USING ERRCODE = '23505', CONSTRAINT = 'financial_reference_reservations_pkey';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_mpesa_receipt_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized TEXT;
  linked_source_id TEXT;
  owner_key TEXT;
  reserved_owner TEXT;
BEGIN
  normalized := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.mpesa_receipt_number, '')));
  IF normalized = '' THEN RETURN NEW; END IF;
  IF NEW.chama_id IS DISTINCT FROM public.app_current_chama_id() THEN
    RAISE EXCEPTION 'Receipt reservation must match the active chama.' USING ERRCODE = '42501';
  END IF;

  IF NEW.transaction_id IS NOT NULL THEN
    SELECT t.source_id INTO linked_source_id
    FROM public.transactions t
    WHERE t.id = NEW.transaction_id AND t.chama_id = NEW.chama_id;
  END IF;
  owner_key := CASE
    WHEN linked_source_id IS NOT NULL THEN 'transaction:' || linked_source_id
    ELSE 'mpesa_callback:' || NEW.source_id
  END;

  INSERT INTO public.financial_reference_reservations (chama_id, normalized_reference, source_record_key)
  VALUES (NEW.chama_id, normalized, owner_key)
  ON CONFLICT (chama_id, normalized_reference) DO NOTHING;

  SELECT source_record_key INTO reserved_owner
  FROM public.financial_reference_reservations
  WHERE chama_id = NEW.chama_id AND normalized_reference = normalized;
  IF reserved_owner IS DISTINCT FROM owner_key THEN
    RAISE EXCEPTION 'Receipt reference is already reserved in this chama.'
      USING ERRCODE = '23505', CONSTRAINT = 'financial_reference_reservations_pkey';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_financial_reference_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Chama deletion may cascade-delete its tenant-scoped reservations; ordinary edits/deletes are forbidden.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.chamas WHERE chama_id = OLD.chama_id
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Receipt reservations are append-only.' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS transactions_receipt_reference_guard ON public.transactions;
CREATE TRIGGER transactions_receipt_reference_guard
  BEFORE INSERT OR UPDATE OF chama_id, source_id, reference_number ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.reserve_transaction_receipt_reference();

DROP TRIGGER IF EXISTS contributions_receipt_reference_guard ON public.contributions;
CREATE TRIGGER contributions_receipt_reference_guard
  BEFORE INSERT OR UPDATE OF chama_id, source_id, reference_number ON public.contributions
  FOR EACH ROW EXECUTE FUNCTION public.reserve_transaction_receipt_reference();

DROP TRIGGER IF EXISTS loan_repayments_receipt_reference_guard ON public.loan_repayments;
CREATE TRIGGER loan_repayments_receipt_reference_guard
  BEFORE INSERT OR UPDATE OF chama_id, source_id, reference_number ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.reserve_transaction_receipt_reference();

DROP TRIGGER IF EXISTS mpesa_callbacks_receipt_reference_guard ON public.mpesa_callbacks;
CREATE TRIGGER mpesa_callbacks_receipt_reference_guard
  BEFORE INSERT OR UPDATE OF chama_id, source_id, transaction_id, mpesa_receipt_number ON public.mpesa_callbacks
  FOR EACH ROW EXECUTE FUNCTION public.reserve_mpesa_receipt_reference();

DROP TRIGGER IF EXISTS financial_reference_reservations_append_only ON public.financial_reference_reservations;
CREATE TRIGGER financial_reference_reservations_append_only
  BEFORE UPDATE OR DELETE ON public.financial_reference_reservations
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_reference_reservation();
