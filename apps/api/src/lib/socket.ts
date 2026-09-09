import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import type { JobUpdateMessage, ServiceReadyMessage, HealthUpdateMessage, DeploymentUpdateMessage } from "@infraena/shared-types";
import { activeWebSocketConnections } from "./metrics.js";

let io: Server | null = null;

export function createSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    activeWebSocketConnections.inc();

    socket.on("join", (room: string) => {
      socket.join(room);
    });

    socket.on("leave", (room: string) => {
      socket.leave(room);
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
