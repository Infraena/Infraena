import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./lib/env.js";
import { authRoutes } from "./routes/auth.js";
import { serviceRoutes } from "./routes/services.js";
import { teamRoutes } from "./routes/teams.js";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  metricsRegistry,
} from "./lib/metrics.js";

export const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
});

await app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

await app.register(cookie, {
  secret: env.JWT_SECRET,
});

await app.register(rateLimit, {
  max: 200,
  timeWindow: "1 minute",
  keyGenerator: (request) => {
    return request.ip;
  },
});

await app.register(swagger, {
  openapi: {
    info: {
      title: "Infraena API",
      description: "Infraena — self-service infrastructure provisioning",
      version: "0.1.0",
    },
    servers: [{ url: `http://localhost:${env.API_PORT}` }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "idp_token",
        },
      },
    },
  },
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
});

const timers = new Map<string, number>();

app.addHook("onRequest", async (request) => {
  timers.set(request.id, Date.now());
});

app.addHook("onResponse", async (request, reply) => {
  const url = request.url;
  if (url.startsWith("/metrics") || url.startsWith("/socket.io") || url.startsWith("/docs")) return;

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

app.register(authRoutes, { prefix: "/auth" });
app.register(serviceRoutes, { prefix: "/api/services" });
app.register(teamRoutes, { prefix: "/api/teams" });

app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});
