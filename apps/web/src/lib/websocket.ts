import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { JobType, JobStatus } from "@idp/shared-types";

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
