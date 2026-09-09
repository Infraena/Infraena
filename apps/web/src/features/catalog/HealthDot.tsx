import type { HealthStatus } from "@infraena/shared-types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface HealthDotProps {
  healthUrl: string | null;
  healthStatus: HealthStatus;
  healthDetail?: string | null;
  latencyMs?: number | null;
  lastHealthCheckAt?: string | null;
  size?: "sm" | "md";
}

const colors: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  unhealthy: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const labels: Record<HealthStatus, string> = {
  healthy: "Healthy",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
};

export function HealthDot({
  healthUrl,
  healthStatus,
  healthDetail,
  latencyMs,
  lastHealthCheckAt,
  size = "md",
}: HealthDotProps) {
  if (!healthUrl) return null;

  const parts = [
    labels[healthStatus],
    latencyMs != null ? `${latencyMs}ms` : null,
    healthDetail ?? null,
    lastHealthCheckAt ? `checked ${formatDistanceToNow(new Date(lastHealthCheckAt), { addSuffix: true })}` : null,
  ].filter((p): p is string => p !== null);

  const title = parts.join(" · ");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 rounded-full",
        size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
        colors[healthStatus]
      )}
      title={title}
      aria-label={title}
      data-testid="health-dot"
    />
  );
}
