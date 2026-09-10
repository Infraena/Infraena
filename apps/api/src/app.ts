import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./lib/env.js";
import { redactUrl } from "./lib/net.js";
import { authRoutes } from "./routes/auth.js";
import { serviceRoutes } from "./routes/services.js";
import { teamRoutes } from "./routes/teams.js";
import { setupRoutes } from "./routes/setup.js";
import { webhookRoutes } from "./routes/webhooks.js";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  metricsRegistry,
} from "./lib/metrics.js";

export const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[REDACTED]",
    },
    serializers: {
      req(req: { method: string; url: string; ip?: string }) {
        return { method: req.method, url: redactUrl(req.url), remoteAddress: req.ip };
      },
    },
  },
  trustProxy: env.TRUST_PROXY,
});

await app.register(helmet, {
  contentSecurityPolicy: false,
  xFrameOptions: { action: "deny" },
  referrerPolicy: { policy: "no-referrer" },
});

await app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

await app.register(cookie, {
  secret: env.JWT_SECRET,
});

await app.register(rateLimit, {
  max: env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
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
          name: "infraena_token",
        },
      },
    },
  },
});

if (process.env.NODE_ENV !== "production" || env.ENABLE_DOCS) {
  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });
}

const timers = new Map<string, number>();

app.addHook("onRequest", async (request) => {
  timers.set(request.id, Date.now());
});

app.addHook("onResponse", async (request, reply) => {
  const url = request.url;
  if (url.startsWith("/metrics") || url.startsWith("/socket.io") || url.startsWith("/docs")) return;

  const route = redactUrl(url.split("?")[0]);
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

app.get("/metrics", async (request, reply) => {
  if (env.METRICS_TOKEN) {
    const auth = request.headers.authorization;
    if (auth !== `Bearer ${env.METRICS_TOKEN}`) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  }
  const metrics = await metricsRegistry().metrics();
  reply.header("Content-Type", metricsRegistry().contentType);
  reply.send(metrics);
});

app.register(authRoutes, { prefix: "/auth" });
app.register(serviceRoutes, { prefix: "/api/services" });
app.register(teamRoutes, { prefix: "/api/teams" });
app.register(setupRoutes, { prefix: "/api/setup" });
app.register(webhookRoutes, { prefix: "/api/webhooks" });

app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});
