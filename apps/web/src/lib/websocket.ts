import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { JobType, JobStatus, HealthUpdateMessage, DeploymentUpdateMessage, WebhookEventMessage } from "@infraena/shared-types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "http://localhost:8080";

interface JobUpdate {
  jobId: string;
  serviceId: string;
  type: JobType;
  status: JobStatus;
  log: string;
}

export function useProvisionLogs(serviceId: string | null) {
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      socket.emit("join", `service:${serviceId}`);
    });

    socket.on("job:update", (msg: JobUpdate) => {
      setLogs((prev) => ({
        ...prev,
        [msg.type]: [...(prev[msg.type] ?? []), msg.log],
      }));
    });

    socket.on("service:ready", () => {
      // handled elsewhere
    });

    socketRef.current = socket;

    return () => {
      socket.emit("leave", `service:${serviceId}`);
      socket.disconnect();
    };
  }, [serviceId]);

  return logs;
}

export function useHealthUpdates(serviceId: string | null) {
  const [last, setLast] = useState<HealthUpdateMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      socket.emit("join", `service:${serviceId}`);
    });

    socket.on("health:update", (msg: HealthUpdateMessage) => {
      if (msg.serviceId === serviceId) setLast(msg);
    });

    socketRef.current = socket;

    return () => {
      socket.emit("leave", `service:${serviceId}`);
      socket.disconnect();
    };
  }, [serviceId]);

  return last;
}

export function useDeploymentUpdates(serviceId: string | null) {
  const [last, setLast] = useState<DeploymentUpdateMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      socket.emit("join", `service:${serviceId}`);
    });

    socket.on("deployment:update", (msg: DeploymentUpdateMessage) => {
      if (msg.serviceId === serviceId) setLast(msg);
    });

    socketRef.current = socket;

    return () => {
      socket.emit("leave", `service:${serviceId}`);
      socket.disconnect();
    };
  }, [serviceId]);

  return last;
}

export function useCatalogLive() {
  const [health, setHealth] = useState<Record<string, HealthUpdateMessage>>({});
  const [deployments, setDeployments] = useState<Record<string, DeploymentUpdateMessage>>({});

  useEffect(() => {
    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      socket.emit("join", "catalog");
    });

    socket.on("health:update", (msg: HealthUpdateMessage) => {
      setHealth((prev) => ({ ...prev, [msg.serviceId]: msg }));
    });

    socket.on("deployment:update", (msg: DeploymentUpdateMessage) => {
      setDeployments((prev) => ({ ...prev, [msg.serviceId]: msg }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { health, deployments };
}

export function useWebhookEvents(serviceId: string | null) {
  const [last, setLast] = useState<WebhookEventMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      socket.emit("join", `service:${serviceId}`);
    });

    socket.on("webhook:event", (msg: WebhookEventMessage) => {
      if (msg.serviceId === serviceId) setLast(msg);
    });

    socketRef.current = socket;

    return () => {
      socket.emit("leave", `service:${serviceId}`);
      socket.disconnect();
    };
  }, [serviceId]);

  return last;
}
