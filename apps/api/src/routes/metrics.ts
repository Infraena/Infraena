import { FastifyInstance } from "fastify";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  metricsRegistry,
} from "../lib/metrics.js";

const timers = new Map<string, number>();

export async function metricsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    timers.set(request.id, Date.now());
  });

  app.addHook("onResponse", async (request, reply) => {
    const url = request.raw.url;
    if (!url) return;
    if (url.startsWith("/metrics") || url.startsWith("/socket.io")) return;

    const route = url.split("?")[0];
    const method = request.method;
    const statusCode = String(reply.statusCode);

    const start = timers.get(request.id);
    if (start) {
      const duration = (Date.now() - start) / 1000;
      httpRequestDurationSeconds.observe({ method, route }, duration);
      timers.delete(request.id);
    }

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
  });

  app.get("/metrics", async (_request, reply) => {
    const metrics = await metricsRegistry().metrics();
    reply.header("Content-Type", metricsRegistry().contentType);
    reply.send(metrics);
  });
}
