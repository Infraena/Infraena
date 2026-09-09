import { useEffect, useState } from "react";
import type { Service, Webhook, WebhookEvent, WebhookKind } from "@infraena/shared-types";
import { WEBHOOK_EVENTS } from "@infraena/shared-types";
import { api } from "@/lib/api";
import { useWebhookEvents } from "@/lib/websocket";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Webhook as WebhookIcon, Copy, Check, RefreshCw, Trash2, Send, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export interface WebhookData {
  inbound: Webhook | null;
  outbound: Webhook[];
  recentEvents: WebhookEvent[];
}

interface WebhooksPanelProps {
  service: Service;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const kindStyles: Record<WebhookKind, string> = {
  slack: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  discord: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
  generic: "bg-secondary text-muted-foreground border-border",
};

const statusStyles: Record<string, string> = {
  received: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  failed: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

const eventLabels: Record<string, string> = {
  "service.ready": "Service ready",
  "service.failed": "Service failed",
  "service.provisioning.step.failed": "Step failed",
  "deployment.started": "Deploy started",
  "deployment.finished": "Deploy finished",
  "health.unhealthy": "Unhealthy",
  "health.recovered": "Recovered",
  "webhook.received": "Webhook received",
  "webhook.test": "Test",
};

function formatEventLabel(event: string): string {
  return eventLabels[event] ?? event;
}

export function WebhooksPanel({ service }: WebhooksPanelProps) {
  const slug = service.slug;
  const [data, setData] = useState<WebhookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [kind, setKind] = useState<WebhookKind>("slack");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const liveEvent = useWebhookEvents(service.id);

  const refresh = async () => {
    const res = await api.get<WebhookData>(`/api/webhooks/${slug}`);
    setData(res);
  };

  useEffect(() => {
    refresh()
      .catch((err) => {
        if (err instanceof Error && err.message === "Not authenticated") {
          setUnauthorized(true);
        } else {
          toast.error(err instanceof Error ? err.message : "Failed to load webhooks");
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!liveEvent) return;
    api
      .get<{ data: WebhookEvent[] }>(`/api/webhooks/${slug}/events?limit=10`)
      .then((res) => setData((prev) => (prev ? { ...prev, recentEvents: res.data } : prev)))
      .catch(() => {});
  }, [liveEvent, slug]);

  const inboundUrl = data?.inbound?.token
    ? `${API_BASE}/api/webhooks/in/${data.inbound.token}`
    : null;

  const doCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const regenerate = async () => {
    if (!data?.inbound || !window.confirm("Regenerate the webhook token? The old URL will stop working immediately.")) {
      return;
    }
    setRegenerating(true);
    try {
      await api.post(`/api/webhooks/${slug}/inbound/regenerate`);
      await refresh();
      toast.success("Webhook token regenerated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  };

  const createOutbound = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Enter a webhook URL");
      return;
    }
    setCreating(true);
    try {
      await api.post(`/api/webhooks/${slug}/outbound`, {
        kind,
        url: trimmed,
        events: selectedEvents.length > 0 ? selectedEvents : ["*"],
      });
      setUrl("");
      setSelectedEvents([]);
      setShowAdd(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  const toggleEnabled = async (webhook: Webhook) => {
    setTogglingId(webhook.id);
    try {
      await api.patch(`/api/webhooks/${slug}/outbound/${webhook.id}`, { enabled: !webhook.enabled });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update webhook");
    } finally {
      setTogglingId(null);
    }
  };

  const sendTest = async (webhook: Webhook) => {
    setTestingId(webhook.id);
    try {
      const res = await api.post<{ ok: boolean; status?: number; error?: string }>(
        `/api/webhooks/${slug}/outbound/${webhook.id}/test`
      );
      if (res.ok) toast.success("Test notification delivered");
      else toast.error(res.error ?? `Delivery failed (HTTP ${res.status})`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  };

  const removeOutbound = async (webhook: Webhook) => {
    if (!window.confirm("Remove this webhook?")) return;
    try {
      await api.delete(`/api/webhooks/${slug}/outbound/${webhook.id}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete webhook");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (unauthorized) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <WebhookIcon className="w-3.5 h-3.5" />
            Webhooks & notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Sign in to manage webhooks and notifications for this service.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <WebhookIcon className="w-3.5 h-3.5" />
          Webhooks & notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {inboundUrl && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Inbound (report events from your CI/CD)
            </p>
            <div className="flex gap-2">
              <Input
                value={inboundUrl}
                readOnly
                className="h-8 text-xs font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button size="sm" variant="outline" onClick={() => doCopy(inboundUrl)} title="Copy URL" className="shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
              <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating} title="Regenerate token" className="shrink-0 gap-1">
                {regenerating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              POST JSON with an <code className="font-mono">event</code> field. <code className="font-mono">deployment.started</code> creates a deployment that Argo CD resolves.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Outbound (Slack / Discord / webhook)
            </p>
            <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-muted-foreground hover:text-foreground">
              {showAdd ? "Cancel" : "+ Add"}
            </button>
          </div>

          {showAdd && (
            <div className="space-y-2 border rounded-md p-3">
              <div className="flex gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as WebhookKind)}
                  className="h-8 text-xs rounded-md border bg-background px-2"
                >
                  <option value="slack">Slack</option>
                  <option value="discord">Discord</option>
                  <option value="generic">Generic</option>
                </select>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WEBHOOK_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    onClick={() =>
                      setSelectedEvents((prev) =>
                        prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
                      )
                    }
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] border transition-colors",
                      selectedEvents.includes(ev)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border"
                    )}
                  >
                    {formatEventLabel(ev)}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={createOutbound} disabled={creating} className="w-full gap-1.5">
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Plus className="w-3.5 h-3.5" />
                Add webhook
              </Button>
            </div>
          )}

          {(data?.outbound ?? []).length === 0 && !showAdd && (
            <p className="text-[10px] text-muted-foreground">No outbound channels configured.</p>
          )}

          {(data?.outbound ?? []).map((wh) => (
            <div key={wh.id} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize", kindStyles[wh.kind])}>
                    {wh.kind}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground truncate">{wh.url}</span>
                </div>
                <button
                  onClick={() => toggleEnabled(wh)}
                  disabled={togglingId === wh.id}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    wh.enabled
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  {togglingId === wh.id ? "..." : wh.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              {wh.events.length > 0 && !wh.events.includes("*") && (
                <div className="flex flex-wrap gap-1">
                  {wh.events.map((ev) => (
                    <span key={ev} className="px-1.5 py-0.5 rounded-full text-[10px] bg-secondary text-muted-foreground border border-border">
                      {formatEventLabel(ev)}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => sendTest(wh)} disabled={testingId === wh.id} className="flex-1 gap-1">
                  {testingId === wh.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Test
                </Button>
                <Button size="sm" variant="outline" onClick={() => removeOutbound(wh)} title="Delete webhook" className="shrink-0">
                  <Trash2 className="w-3 h-3 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Recent events</p>
          {(data?.recentEvents ?? []).length === 0 && (
            <p className="text-[10px] text-muted-foreground">No events yet.</p>
          )}
          {(data?.recentEvents ?? []).map((ev) => (
            <div key={ev.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium border", statusStyles[ev.status])}>
                  {ev.status}
                </span>
                <span className="truncate">{formatEventLabel(ev.event)}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{ev.direction}</span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}