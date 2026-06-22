import { Counter, Histogram, Gauge, register } from "prom-client";

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

export const provisionJobsTotal = new Counter({
  name: "idp_provision_jobs_total",
  help: "Total number of provision jobs",
  labelNames: ["type", "status"] as const,
});

export const provisionJobDurationSeconds = new Histogram({
  name: "idp_provision_job_duration_seconds",
  help: "Duration of provision jobs in seconds",
  labelNames: ["type"] as const,
  buckets: [5, 10, 30, 60, 120, 300, 600],
});

export const servicesGauge = new Gauge({
  name: "idp_services",
  help: "Number of services by status",
  labelNames: ["status"] as const,
});

export const activeWebSocketConnections = new Gauge({
  name: "idp_ws_connections",
  help: "Number of active WebSocket connections",
});

export function recordProvisionJob(type: string, durationMs: number) {
  const seconds = durationMs / 1000;
  provisionJobDurationSeconds.observe({ type }, seconds);
}

export function metricsRegistry() {
  return register;
}
