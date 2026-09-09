import { useEffect, useState } from "react";
import type { Service, HealthStatus } from "@infraena/shared-types";
import { api } from "@/lib/api";
import { useHealthUpdates } from "@/lib/websocket";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface HealthCheckOutcome {
  status: HealthStatus;
  latencyMs: number;
  detail: string;
  checkedAt: string;
}

interface HealthCardProps {
  service: Service;
  onServiceChange?: (service: Service) => void;
}

const labelStyles: Record<HealthStatus, string> = {
  healthy: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  unhealthy: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  unknown: "bg-secondary text-muted-foreground border-border",
};

const dotStyles: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  unhealthy: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const labelText: Record<HealthStatus, string> = {
  healthy: "Healthy",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
};

export function HealthCard({ service, onServiceChange }: HealthCardProps) {
  const live = useHealthUpdates(service.id);
  const [urlInput, setUrlInput] = useState(service.healthUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setUrlInput(service.healthUrl ?? "");
  }, [service.healthUrl]);

  const status: HealthStatus = live?.status ?? service.healthStatus;
  const latencyMs = live?.latencyMs ?? service.healthLatencyMs;
  const detail = live?.detail ?? service.healthDetail;
  const checkedAt = live?.checkedAt ?? service.lastHealthCheckAt;

  const saveUrl = async () => {
    const next = urlInput.trim() || null;
    if (next === service.healthUrl) return;
    setSaving(true);
    try {
      const res = await api.patch<{ success: boolean; data: Service }>(
        `/api/services/${service.slug}`,
        { healthUrl: next }
      );
      onServiceChange?.(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save health URL");
    } finally {
      setSaving(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await api.post<{ success: boolean; data: HealthCheckOutcome }>(
        `/api/services/${service.slug}/health/check`
      );
      onServiceChange?.({
        ...service,
        healthStatus: res.data.status,
        healthDetail: res.data.detail,
        healthLatencyMs: res.data.latencyMs,
        lastHealthCheckAt: res.data.checkedAt,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", labelStyles[status])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[status])} />
            {labelText[status]}
          </span>
          {checkedAt && (
            <span className="text-[10px] text-muted-foreground" title={detail ?? undefined}>
              {latencyMs != null ? `${latencyMs}ms · ` : ""}checked {formatDistanceToNow(new Date(checkedAt), { addSuffix: true })}
            </span>
          )}
        </div>

        {detail && status !== "unknown" && (
          <p className="text-[10px] text-muted-foreground font-mono break-all">{detail}</p>
        )}

        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveUrl(); }}
            placeholder="https://your-service.example.com/health"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="outline" onClick={saveUrl} disabled={saving || urlInput.trim() === (service.healthUrl ?? "")} className="shrink-0">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </Button>
        </div>

        {service.healthUrl && (
          <Button size="sm" variant="outline" onClick={checkNow} disabled={checking} className="w-full gap-1.5">
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {checking ? "Checking..." : "Check now"}
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground">
          {service.healthUrl ? "Auto-check every 60s. Update the URL or clear it to disable." : "Set a URL to enable automatic health checks."}
        </p>
      </CardContent>
    </Card>
  );
}
