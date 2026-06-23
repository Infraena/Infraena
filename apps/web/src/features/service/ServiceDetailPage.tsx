import { useEffect, useState } from "react";
import type { Service, ProvisionJob, Deployment, ServiceDependency } from "@idp/shared-types";
import { api } from "@/lib/api";
import { useProvisionLogs } from "@/lib/websocket";
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
import { toast } from "sonner";

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
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [deployEnvironment, setDeployEnvironment] = useState("staging");
  const [deployVersion, setDeployVersion] = useState("");
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);
  const [provisionSteps, setProvisionSteps] = useState<string[]>(["github", "terraform", "vault"]);
  const [provisionBranchProtection, setProvisionBranchProtection] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [provisioningServiceId, setProvisioningServiceId] = useState<string | null>(null);
  const [deps, setDeps] = useState<{ dependsOn: ServiceDependency[]; dependedOnBy: ServiceDependency[] }>({ dependsOn: [], dependedOnBy: [] });
  const [showAddDep, setShowAddDep] = useState(false);
  const [depTarget, setDepTarget] = useState("");
  const [depSearch, setDepSearch] = useState("");
  const [depSearchResults, setDepSearchResults] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [depAdding, setDepAdding] = useState(false);

  const provisionLogs = useProvisionLogs(provisioningServiceId);

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
        await loadDeps();
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

  async function loadDeps() {
    api.get<{ dependsOn: ServiceDependency[]; dependedOnBy: ServiceDependency[] }>(
      `/api/services/${slug}/dependencies`
    ).then(setDeps).catch(() => setDeps({ dependsOn: [], dependedOnBy: [] }));
  }

  const searchServices = async (query: string) => {
    if (query.length < 2) { setDepSearchResults([]); return; }
    setDepSearch(query);
    try {
      const res = await api.get<{ data: { id: string; name: string; slug: string }[] }>(`/api/services?limit=10`);
      setDepSearchResults(
        (res.data ?? []).filter((s) => s.slug !== slug && s.name.toLowerCase().includes(query.toLowerCase()))
      );
    } catch {}
  };

  const addDependency = async (targetSlug: string) => {
    if (!service) return;
    setDepAdding(true);
    try {
      await api.post(`/api/services/${service.slug}/dependencies`, { targetSlug });
      await loadDeps();
      setShowAddDep(false);
      setDepTarget("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add dependency");
    } finally {
      setDepAdding(false);
    }
  };

  const removeDependency = async (depId: string) => {
    if (!service) return;
    try {
      await api.delete(`/api/services/${service.slug}/dependencies/${depId}`);
      await loadDeps();
    } catch {}
  };

  const handleDeploy = async () => {
    if (!service) return;
    setDeploying(true);
    try {
      await api.post(`/api/services/${service.slug}/deploy`, {
        environment: deployEnvironment,
        version: deployVersion.trim() || "latest",
      });
      setShowDeployDialog(false);
      await loadDeployments(1);
      const act = await api.get<ActivityItem[]>(`/api/services/${slug}/activity`).catch(() => []);
      setActivity(act);
    } catch {} finally {
      setDeploying(false);
    }
  };

  const doneSteps = new Set(jobs.filter((j) => j.status === "success").map((j) => j.type));
  const allSteps = ["github", "terraform", "vault"] as const;
  const missingSteps = allSteps.filter((s) => !doneSteps.has(s));

  const handleProvision = async () => {
    if (!service) return;
    setProvisioning(true);
    try {
      await api.post(`/api/services/${service.slug}/provision`, {
        steps: provisionSteps,
        enableBranchProtection: provisionBranchProtection,
      });
      setShowProvisionDialog(false);
      setProvisioningServiceId(service.id);

      const poll = setInterval(async () => {
        try {
          const jobsData = await api.get<ProvisionJob[]>(`/api/services/${slug}/jobs`).catch(() => []);
          setJobs(jobsData);
          const allDone = jobsData.length > 0 && jobsData.every((j) => j.status === "success" || j.status === "failed");
          if (allDone && jobsData.length >= provisionSteps.length) {
            const svc = await api.get<Service>(`/api/services/${service.slug}`);
            setService(svc);
            const act = await api.get<ActivityItem[]>(`/api/services/${slug}/activity`).catch(() => []);
            setActivity(act);
            setProvisioningServiceId(null);
            clearInterval(poll);
          }
        } catch {}
      }, 2500);
    } catch {} finally {
      setProvisioning(false);
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
          {(service.status === "imported" || (service.status === "ready" && missingSteps.length > 0)) && (
            <Button onClick={() => {
              setProvisionSteps(missingSteps);
              setShowProvisionDialog(true);
            }} disabled={provisioning} size="sm" variant="outline" className="gap-1.5">
              <Bolt className="w-3.5 h-3.5" />Provision
            </Button>
          )}
          {service.status === "ready" && (
            <Button onClick={() => setShowDeployDialog(true)} disabled={deploying} size="sm" className="gap-1.5">
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
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.message}</p>
                        {item.error && <p className="text-[10px] text-red-500 mt-0.5 font-mono line-clamp-2">{item.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Provisioning Jobs */}
          {provisioningServiceId ? (
            <Card className="border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Provisioning...
                </CardTitle>
                <CardDescription>Real-time logs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {provisionSteps.map((type) => (
                  <div key={type}>
                    <h4 className="text-xs font-medium mb-1 capitalize text-muted-foreground">{type}</h4>
                    <LogTerminal logs={provisionLogs[type] ?? []} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : jobs.length > 0 && (
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

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Dependencies</CardTitle>
                <button onClick={() => { setShowAddDep(!showAddDep); setDepSearch(""); setDepSearchResults([]); }} className="text-xs text-muted-foreground hover:text-foreground">
                  {showAddDep ? "Cancel" : "+ Add"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {showAddDep && (
                <div className="space-y-2">
                  <Input
                    value={depSearch}
                    onChange={(e) => searchServices(e.target.value)}
                    placeholder="Search services..."
                    className="h-7 text-xs"
                    autoFocus
                  />
                  {depSearchResults.length > 0 && (
                    <div className="border rounded-md max-h-32 overflow-y-auto">
                      {depSearchResults.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => addDependency(s.slug)}
                          disabled={depAdding}
                          className="w-full text-left px-2 py-1.5 hover:bg-secondary text-xs transition-colors"
                        >
                          {s.name} <span className="text-muted-foreground">{s.slug}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {depSearch.length >= 2 && depSearchResults.length === 0 && (
                    <p className="text-muted-foreground">No services found</p>
                  )}
                </div>
              )}
              {deps.dependsOn.length === 0 && deps.dependedOnBy.length === 0 ? (
                <p className="text-muted-foreground">No dependencies defined</p>
              ) : (
                <>
                  {deps.dependsOn.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1">Depends on</p>
                      <div className="space-y-1">
                        {deps.dependsOn.map((d) => (
                          <div key={d.id} className="flex items-center justify-between group">
                            <button onClick={() => onNavigate(`/services/${d.targetService?.slug}`)} className="text-primary hover:underline text-left">
                              {d.targetService?.name ?? d.targetServiceId}
                            </button>
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[8px]">{d.type}</Badge>
                              <button onClick={() => removeDependency(d.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {deps.dependedOnBy.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1">Depended on by</p>
                      <div className="space-y-1">
                        {deps.dependedOnBy.map((d) => (
                          <div key={d.id} className="flex items-center justify-between">
                            <button onClick={() => onNavigate(`/services/${d.sourceService?.slug}`)} className="text-primary hover:underline text-left">
                              {d.sourceService?.name ?? d.sourceServiceId}
                            </button>
                            <Badge variant="secondary" className="text-[8px]">{d.type}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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

      {showProvisionDialog && service && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowProvisionDialog(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg max-w-sm w-full mx-4 p-6 animate-fade-up">
            <button onClick={() => setShowProvisionDialog(false)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-semibold mb-4">Provision infrastructure</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Apply missing provisioning steps to this service. Already completed steps are pre-selected off.
            </p>
            <div className="space-y-2 mb-5">
              {([
                { key: "github", label: "GitHub topic" },
                { key: "terraform", label: "Terraform Cloud workspace" },
                { key: "vault", label: "Vault secrets" },
              ] as const).map(({ key, label }) => {
                const alreadyDone = doneSteps.has(key);
                const checked = provisionSteps.includes(key);
                return (
                  <label key={key} className={`flex items-start gap-2 p-2 rounded-md border text-xs transition-colors ${checked ? "border-primary bg-primary/5" : "border-input hover:border-primary/30"} ${alreadyDone ? "opacity-50" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={alreadyDone}
                      onChange={() => setProvisionSteps((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-xs font-medium">{label}</span>
                      {alreadyDone && <span className="text-[10px] text-emerald-600 ml-1.5">Already done</span>}
                    </div>
                  </label>
                );
              })}
            </div>
            {provisionSteps.includes("github") && !doneSteps.has("github") && (
              <label className="flex items-center gap-2 cursor-pointer mb-5">
                <input type="checkbox" checked={provisionBranchProtection} onChange={(e) => setProvisionBranchProtection(e.target.checked)} className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary" />
                <span className="text-xs text-muted-foreground">Enable branch protection</span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowProvisionDialog(false)} disabled={provisioning}>Cancel</Button>
              <Button size="sm" onClick={handleProvision} disabled={provisioning || provisionSteps.length === 0}>
                {provisioning ? "Provisioning..." : "Provision"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDeployDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeployDialog(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg max-w-sm w-full mx-4 p-6 animate-fade-up">
            <button
              onClick={() => setShowDeployDialog(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-semibold mb-4">Deploy service</h3>
            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Environment</label>
                <div className="flex gap-2">
                  {(["staging", "production"] as const).map((env) => (
                    <button
                      key={env}
                      onClick={() => setDeployEnvironment(env)}
                      className={`flex-1 px-3 py-2 text-xs rounded-md border capitalize transition-colors ${
                        deployEnvironment === env
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-input hover:border-foreground/20"
                      }`}
                    >
                      {env}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Version (optional)</label>
                <Input
                  value={deployVersion}
                  onChange={(e) => setDeployVersion(e.target.value)}
                  placeholder="latest"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeployDialog(false)} disabled={deploying}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleDeploy} disabled={deploying}>
                {deploying ? "Deploying..." : "Deploy"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
