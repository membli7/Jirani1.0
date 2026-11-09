"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");

const requestContext = new AsyncLocalStorage();

function writeLog(level, message, fields = {}) {
  const context = requestContext.getStore();
  if (process.env.NODE_ENV === "production") {
    const record = {
      ...fields,
      timestamp: new Date().toISOString(),
      level,
      message: String(message),
      ...(context?.requestId ? { requestId: context.requestId } : {}),
    };
    console[level](JSON.stringify(record));
    return;
  }

  const developmentFields = { ...fields };
  if (context?.requestId) developmentFields.requestId = context.requestId;
  console[level](message, developmentFields);
}

const logger = {
  info: (message, fields = {}) => writeLog("info", message, fields),
  warn: (message, fields = {}) => writeLog("warn", message, fields),
  error: (message, fields = {}) => writeLog("error", message, fields),
};

function requestIdMiddleware(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  requestContext.run({ requestId }, next);
}

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
const responseStatusCounts = new Map();
const requestDurationBucketsMs = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const requestDurationBucketCounts = new Map(requestDurationBucketsMs.map(bound => [bound, 0]));
let requestDurationCount = 0;
let requestDurationMs = 0;
let requestServerErrorCount = 0;
let operationalMetricsProvider = () => ({});

function latencyMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const statusCode = Number(res.statusCode);
    requestCount.inc();
    requestDurationCount += 1;
    requestDurationMs += durationMs;
    for (const bound of requestDurationBucketsMs) {
      if (durationMs <= bound) requestDurationBucketCounts.set(bound, requestDurationBucketCounts.get(bound) + 1);
    }
    if (Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) {
      const label = String(statusCode);
      responseStatusCounts.set(label, (responseStatusCounts.get(label) || 0) + 1);
      if (statusCode >= 500) requestServerErrorCount += 1;
    }
    logger.info("HTTP request completed", {
      method: req.method,
      statusCode,
      durationMs: Number(durationMs.toFixed(3)),
    });
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
  const requestTotal = requestCount.get();
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
    `chama_http_requests_total ${requestTotal}`,
    "# TYPE chama_http_responses_total counter",
    ...[...responseStatusCounts.entries()]
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([statusCode, count]) => `chama_http_responses_total{status_code="${statusCode}"} ${count}`),
    "# TYPE chama_http_server_errors_total counter",
    `chama_http_server_errors_total ${requestServerErrorCount}`,
    "# HELP chama_http_server_error_rate Fraction of observed requests returning 5xx since process start.",
    "# TYPE chama_http_server_error_rate gauge",
    `chama_http_server_error_rate ${requestTotal ? requestServerErrorCount / requestTotal : 0}`,
    "# TYPE chama_http_request_duration_milliseconds_total counter",
    `chama_http_request_duration_milliseconds_total ${requestDurationMs}`,
    "# TYPE chama_http_request_duration_milliseconds histogram",
    ...requestDurationBucketsMs.map(bound => `chama_http_request_duration_milliseconds_bucket{le="${bound}"} ${requestDurationBucketCounts.get(bound)}`),
    `chama_http_request_duration_milliseconds_bucket{le="+Inf"} ${requestDurationCount}`,
    `chama_http_request_duration_milliseconds_sum ${requestDurationMs}`,
    `chama_http_request_duration_milliseconds_count ${requestDurationCount}`,
  ];
  for (const [name, value] of Object.entries(operational)) {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name) || !Number.isFinite(Number(value))) continue;
    lines.push(`# TYPE chama_${name} gauge`, `chama_${name} ${Number(value)}`);
  }
  res.type("text/plain; version=0.0.4; charset=utf-8").send(`${lines.join("\n")}\n`);
}

module.exports = {
  logger,
  requestIdMiddleware,
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
