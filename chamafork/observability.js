"use strict";

const logger = {
  info: (message, fields = {}) => console.info(message, fields),
  warn: (message, fields = {}) => console.warn(message, fields),
  error: (message, fields = {}) => console.error(message, fields),
};

function gauge() {
  let value = 0;
  return {
    inc(amount = 1) { value += Number(amount) || 0; },
    dec(amount = 1) { value = Math.max(0, value - (Number(amount) || 0)); },
    set(next) { value = Number(next) || 0; },
    get() { return value; },
  };
}

function counter() {
  let value = 0;
  return {
    inc(amount = 1) { value += Math.max(0, Number(amount) || 0); },
    get() { return value; },
  };
}

const activeSessionsGauge = gauge();
const openSseGauge = gauge();
const redisCacheHitsTotal = counter();
const redisCacheMissesTotal = counter();
const redisCacheHitRate = gauge();
const requestCount = counter();
let requestDurationMs = 0;
let operationalMetricsProvider = () => ({});

function latencyMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.once("finish", () => {
    requestCount.inc();
    requestDurationMs += Number(process.hrtime.bigint() - startedAt) / 1e6;
  });
  next();
}

function wrapPgPool(pool) {
  return pool;
}

function setOperationalMetricsProvider(provider) {
  operationalMetricsProvider = typeof provider === "function" ? provider : () => ({});
}

function metricsHandler(req, res) {
  let operational = {};
  try { operational = operationalMetricsProvider() || {}; } catch (error) {
    logger.error("Could not collect operational metrics", { err: error.message });
  }
  const lines = [
    "# TYPE chama_active_sessions gauge",
    `chama_active_sessions ${activeSessionsGauge.get()}`,
    "# TYPE chama_open_sse_connections gauge",
    `chama_open_sse_connections ${openSseGauge.get()}`,
    "# TYPE chama_redis_cache_hits_total counter",
    `chama_redis_cache_hits_total ${redisCacheHitsTotal.get()}`,
    "# TYPE chama_redis_cache_misses_total counter",
    `chama_redis_cache_misses_total ${redisCacheMissesTotal.get()}`,
    "# TYPE chama_redis_cache_hit_rate gauge",
    `chama_redis_cache_hit_rate ${redisCacheHitRate.get()}`,
    "# TYPE chama_http_requests_total counter",
    `chama_http_requests_total ${requestCount.get()}`,
    "# TYPE chama_http_request_duration_milliseconds_total counter",
    `chama_http_request_duration_milliseconds_total ${requestDurationMs}`,
  ];
  for (const [name, value] of Object.entries(operational)) {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name) || !Number.isFinite(Number(value))) continue;
    lines.push(`# TYPE chama_${name} gauge`, `chama_${name} ${Number(value)}`);
  }
  res.type("text/plain; version=0.0.4; charset=utf-8").send(`${lines.join("\n")}\n`);
}

module.exports = {
  logger,
  latencyMiddleware,
  activeSessionsGauge,
  openSseGauge,
  wrapPgPool,
  metricsHandler,
  redisCacheHitsTotal,
  redisCacheMissesTotal,
  redisCacheHitRate,
  setOperationalMetricsProvider,
};
