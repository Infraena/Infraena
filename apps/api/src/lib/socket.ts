import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import type { JobUpdateMessage, ServiceReadyMessage, HealthUpdateMessage, DeploymentUpdateMessage, WebhookEventMessage } from "@infraena/shared-types";
import { activeWebSocketConnections } from "./metrics.js";
import { verifyJWT } from "./auth.js";

let io: Server | null = null;

export function extractToken(authToken: unknown, cookieHeader: string | undefined): string | null {
  if (typeof authToken === "string" && authToken) return authToken;
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("infraena_token="));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice("infraena_token=".length));
  } catch {
    return null;
  }
}

export function isAllowedRoom(room: string): boolean {
  return room === "catalog" || /^service:[0-9a-f-]{36}$/i.test(room);
}

export function createSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket.handshake.auth?.token, socket.handshake.headers.cookie);
      if (!token) return next(new Error("unauthorized"));
      socket.data.user = await verifyJWT(token);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    activeWebSocketConnections.inc();

    socket.on("join", (room: string) => {
      if (typeof room === "string" && isAllowedRoom(room)) socket.join(room);
    });

    socket.on("leave", (room: string) => {
      if (typeof room === "string" && isAllowedRoom(room)) socket.leave(room);
    });

    socket.on("disconnect", () => {
      activeWebSocketConnections.dec();
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.io not initialized. Call createSocketServer first.");
  }
  return io;
}

export function emitJobUpdate(serviceId: string, message: JobUpdateMessage) {
  if (!io) return;
  io.to(`service:${serviceId}`).emit("job:update", message);
}

export function emitServiceReady(serviceId: string, message: ServiceReadyMessage) {
  if (!io) return;
  io.to(`service:${serviceId}`).emit("service:ready", message);
}

export function emitHealthUpdate(serviceId: string, message: HealthUpdateMessage) {
  if (!io) return;
  io.to(`service:${serviceId}`).to("catalog").emit("health:update", message);
}

export function emitDeploymentUpdate(serviceId: string, message: DeploymentUpdateMessage) {
  if (!io) return;
  io.to(`service:${serviceId}`).to("catalog").emit("deployment:update", message);
}

export function emitWebhookEvent(serviceId: string, message: WebhookEventMessage) {
  if (!io) return;
  io.to(`service:${serviceId}`).emit("webhook:event", message);
}
