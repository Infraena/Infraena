import { useEffect, useState } from "react";
import type { Service, ProvisionJob, Deployment } from "@idp/shared-types";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { StackBadge } from "@/components/StackBadge";
import { LogTerminal } from "@/components/LogTerminal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, ExternalLink, Github, Server, Key, Clock, Calendar, Hash, Rocket, CircleDot,
  Trash2, ChevronLeft, ChevronRight, Copy, Check, Pencil, X, Bolt,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  type: "job" | "deployment";
  subType?: string;
  version?: string;
  environment?: string;
  status: string;
  message: string;
  error?: string | null;
  createdAt: string;
}

export function ServiceDetailPage({ slug, onNavigate }: { slug: string; onNavigate: (path: string) => void }) {
  const [service, setService] = useState<Service | null>(null);
  const [jobs, setJobs] = useState<ProvisionJob[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [depPage, setDepPage] = useState(1);
  const [depTotalPages, setDepTotalPages] = useState(1);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const svc = await api.get<Service>(`/api/services/${slug}`);
        setService(svc);
        setEditName(svc.name);
        setEditDesc(svc.description ?? "");

        const [jobsData, activityData] = await Promise.all([
          api.get<ProvisionJob[]>(`/api/services/${slug}/jobs`).catch(() => []),
          api.get<ActivityItem[]>(`/api/services/${slug}/activity`).catch(() => []),
        ]);
        setJobs(jobsData);
        setActivity(activityData);
        await loadDeployments(1);
      } catch {
        setService(null);
      } finally {
        setLoading(false);
        window.scrollTo(0, 0);
      }
    }
    load();
  }, [slug]);

  async function loadDeployments(page: number) {
    const res = await api.get<{ data: Deployment[]; pagination: { page: number; totalPages: number } }>(
      `/api/services/${slug}/deployments?page=${page}&limit=5`
    ).catch(() => ({ data: [], pagination: { page: 1, totalPages: 1 } }));
    setDeployments(res.data);
    setDepPage(res.pagination.page);
    setDepTotalPages(res.pagination.totalPages);
  }

  const handleDeploy = async () => {
    if (!service) return;
    setDeploying(true);
    try {
      await api.post(`/api/services/${service.slug}/deploy`);
      await loadDeployments(1);
      const act = await api.get<ActivityItem[]>(`/api/services/${slug}/activity`).catch(() => []);
      setActivity(act);
    } catch {} finally {
      setDeploying(false);
    }
  };

  const handleDelete = async () => {
    if (!service) return;
    setDeleting(true);
    try {
      await api.delete(`/api/services/${service.slug}`);
      onNavigate("/");
    } catch {} finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  const saveName = async () => {
    if (!service || !editName.trim() || editName === service.name) { setEditingName(false); return; }
    setSaving(true);
    try {
      const updated = await api.patch<Service>(`/api/services/${service.slug}`, { name: editName.trim() });
      setService(updated);
      if (updated.slug !== service.slug) onNavigate(`/services/${updated.slug}`);
    } catch {} finally {
      setSaving(false);
      setEditingName(false);
    }
  };

  const saveDesc = async () => {
    if (!service || editDesc === (service.description ?? "")) { setEditingDesc(false); return; }
    setSaving(true);
    try {
      const updated = await api.patch<Service>(`/api/services/${service.slug}`, { description: editDesc || null });
      setService(updated);
    } catch {} finally {
      setSaving(false);
      setEditingDesc(false);
    }
  };

  const doCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const healthStatus = service && deployments.length > 0
    ? (deployments[0].status === "success" ? "healthy" : "unhealthy")
    : null;

  if (loading) {
    return (
      <div className="animate-fade-up">
        <Skeleton className="h-4 w-20 mb-4" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-up">
        <CircleDot className="w-10 h-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Service not found</p>
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => onNavigate("/")}>
          <ArrowLeft className="w-3.5 h-3.5" />Back to catalog
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <button onClick={() => onNavigate("/")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="w-3.5 h-3.5" />Catalog
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-xl font-semibold w-[300px] font-mono"
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }} autoFocus />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveName} disabled={saving}><Check className="w-4 h-4 text-emerald-500" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingName(false)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
                <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <StatusBadge status={service.status} />
            {healthStatus && (
              <span className={healthStatus === "healthy" ? "text-emerald-500" : "text-red-500"} title={healthStatus}>
                {healthStatus === "healthy" ? <Check className="w-4 h-4" /> : <Bolt className="w-4 h-4" />}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StackBadge category={service.category} languages={service.languages} size="sm" />
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1">
              {service.slug}
              <button onClick={() => doCopy(service.slug, "slug")} className="hover:text-foreground">
                {copied === "slug" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </span>
          </div>
          {editingDesc ? (
            <div className="flex items-center gap-2 mt-2">
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-7 text-sm max-w-md"
                onKeyDown={(e) => { if (e.key === "Enter") saveDesc(); if (e.key === "Escape") setEditingDesc(false); }} placeholder="What does this service do?" autoFocus />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveDesc} disabled={saving}><Check className="w-4 h-4 text-emerald-500" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingDesc(false)}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              {service.description ? (
                <p className="text-sm text-muted-foreground max-w-2xl">{service.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">No description</p>
              )}
              <button onClick={() => setEditingDesc(true)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {service.githubRepoUrl && (
            <a href={service.githubRepoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Github className="w-3.5 h-3.5" />Repo
              </Button>
            </a>
          )}
          {service.status === "ready" && (
            <Button onClick={handleDeploy} disabled={deploying} size="sm" className="gap-1.5">
              <Rocket className="w-3.5 h-3.5" />{deploying ? "Deploying..." : "Deploy"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950"
            disabled={deleting} onClick={() => setShowConfirm(true)}>
            <Trash2 className="w-3.5 h-3.5" />Delete
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Activity Timeline */}
          {activity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity</CardTitle>
                <CardDescription>Recent events on this service</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activity.slice(0, 10).map((item, i) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.type === "deployment" ? "bg-blue-500" : item.status === "success" ? "bg-emerald-500" : item.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                        {i < Math.min(activity.length, 10) - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium capitalize">
                            {item.type === "deployment" ? "deploy" : item.subType}
                          </span>
                          <Badge variant="outline" className="text-[9px] capitalize">{item.status}</Badge>
                          {item.version && <Badge variant="secondary" className="text-[9px] font-mono">{item.version}</Badge>}
                          <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.message}</p>
                        {item.error && <p className="text-[10px] text-red-500 mt-0.5 font-mono truncate">{item.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Provisioning Jobs */}
          {jobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Provisioning jobs</CardTitle>
                <CardDescription>Infrastructure provisioning task logs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {jobs.map((job, i) => (
                    <div key={job.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium capitalize flex items-center gap-2">
                          {job.type === "github" ? <Github className="w-3.5 h-3.5" /> : job.type === "terraform" ? <Server className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
                          {job.type}
                        </span>
                        <Badge variant={job.status === "success" ? "outline" : job.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                          {job.status}
                        </Badge>
                      </div>
                      {job.logs.length > 0 && <LogTerminal logs={job.logs} />}
                      {job.error && <p className="text-xs text-red-500 mt-1 font-mono">{job.error}</p>}
                      {i < jobs.length - 1 && <Separator className="mt-3" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>Created {formatDistanceToNow(new Date(service.createdAt), { addSuffix: true })}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Updated {formatDistanceToNow(new Date(service.updatedAt), { addSuffix: true })}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="w-3.5 h-3.5" />
                <span className="font-mono text-xs flex items-center gap-1">
                  {service.id.slice(0, 8)}
                  <button onClick={() => doCopy(service.id, "id")} className="hover:text-foreground">
                    {copied === "id" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </span>
              </div>
              {service.githubRepoUrl && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Github className="w-3.5 h-3.5" />
                  <span className="text-xs truncate flex items-center gap-1">
                    {service.githubRepoUrl.replace("https://github.com/", "")}
                    <button onClick={() => doCopy(service.githubRepoUrl!, "repo")} className="hover:text-foreground shrink-0">
                      {copied === "repo" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {deployments.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Deployments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {deployments.map((dep) => (
                    <div key={dep.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono">{dep.version}</Badge>
                        <Badge variant="secondary" className="text-[10px] capitalize">{dep.environment}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${dep.status === "success" ? "bg-emerald-500" : dep.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className="text-[10px] capitalize text-muted-foreground">{dep.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {depTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={depPage <= 1} onClick={() => loadDeployments(depPage - 1)}>
                      <ChevronLeft className="w-3 h-3 mr-1" />Prev
                    </Button>
                    <span className="text-[10px] text-muted-foreground">{depPage}/{depTotalPages}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={depPage >= depTotalPages} onClick={() => loadDeployments(depPage + 1)}>
                      Next<ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {service.status === "failed" && (
            <Card className="border-red-200">
              <CardContent className="pt-6 text-sm">
                <p className="text-red-700">Provisioning failed. Check the job logs for details.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Delete service"
        message={`Delete "${service.name}"? All associated jobs, deployments and infrastructure records will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
