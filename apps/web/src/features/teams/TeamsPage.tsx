import { useState, useEffect } from "react";
import type { Service, ServiceCategory, ServiceLanguage } from "@idp/shared-types";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { StackBadge } from "@/components/StackBadge";
import { Users, Plus, Trash2, Loader2, Pencil, X, Check, Search, UserPlus, ArrowRight, CircleDot } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  _count?: { services: number; users: number };
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  users: { id: string; username: string; role: string; avatarUrl?: string }[];
  services: (Service & { status: string; category: ServiceCategory; languages: ServiceLanguage[] })[];
  _count: { services: number; users: number };
}

export function TeamsPage({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [addUserSlug, setAddUserSlug] = useState<string | null>(null);
  const [addUsername, setAddUsername] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [grantRepoAccess, setGrantRepoAccess] = useState(false);

  const loadTeams = () => {
    api.get<Team[]>("/api/teams")
      .then(setTeams)
      .catch(() => toast.error("Failed to load teams"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadTeams(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/teams", { name: newName.trim() });
      setNewName("");
      toast.success("Team created");
      loadTeams();
    } catch {
      toast.error("Failed to create team");
    } finally {
      setCreating(false);
    }
  };

  const loadDetail = async (slug: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.get<TeamDetail>(`/api/teams/${slug}`);
      setSelectedTeam(detail);
    } catch {
      toast.error("Failed to load team details");
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTeam = (slug: string) => {
    if (selectedTeam?.slug === slug) {
      setSelectedTeam(null);
    } else {
      loadDetail(slug);
    }
  };

  const saveEdit = async () => {
    if (!editingSlug || !editName.trim()) { setEditingSlug(null); return; }
    setSavingEdit(true);
    try {
      const updated = await api.patch<Team>(`/api/teams/${editingSlug}`, { name: editName.trim() });
      toast.success("Team renamed");
      loadTeams();
      if (selectedTeam?.slug === editingSlug) {
        loadDetail(updated.slug);
      }
      setEditingSlug(null);
    } catch {
      toast.error("Failed to rename team");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmSlug) return;
    setDeleting(true);
    try {
      await api.delete(`/api/teams/${confirmSlug}`);
      toast.success("Team deleted");
      if (selectedTeam?.slug === confirmSlug) setSelectedTeam(null);
      loadTeams();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete team";
      toast.error(msg);
    } finally {
      setDeleting(false);
      setConfirmSlug(null);
    }
  };

  const addMember = async () => {
    if (!addUserSlug || !addUsername.trim()) return;
    setAddingMember(true);
    try {
      const res = await api.post<{ success: boolean; reposGranted?: number }>(`/api/teams/${addUserSlug}/members`, {
        username: addUsername.trim(),
        grantRepoAccess,
      });
      const msg = grantRepoAccess && res.reposGranted
        ? `Member added with access to ${res.reposGranted} repo(s)`
        : "Member added";
      toast.success(msg);
      setAddUsername("");
      setGrantRepoAccess(false);
      loadTeams();
      loadDetail(addUserSlug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (teamSlug: string, userId: string) => {
    try {
      await api.delete(`/api/teams/${teamSlug}/members/${userId}`);
      toast.success("Member removed");
      loadTeams();
      loadDetail(teamSlug);
    } catch {
      toast.error("Failed to remove member");
    }
  };

  return (
    <div className="animate-fade-up max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Teams</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Manage teams, members and their services.
      </p>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New team name..."
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="gap-1.5">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No teams yet. Create one to start.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <div key={team.id}>
              <Card className={selectedTeam?.slug === team.slug ? "ring-1 ring-primary/20" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <button
                      className="flex-1 text-left flex items-center gap-3"
                      onClick={() => selectTeam(team.slug)}
                    >
                      <div>
                        {editingSlug === team.slug ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-7 w-48 text-sm font-medium"
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingSlug(null); }}
                              autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit} disabled={savingEdit}>
                              <Check className="w-4 h-4 text-emerald-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingSlug(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{team.name}</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingSlug(team.slug); setEditName(team.name); }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground font-mono">{team.slug}</p>
                        {team._count && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {team._count.services} service{team._count.services !== 1 ? "s" : ""} · {team._count.users} member{team._count.users !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      {onNavigate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs gap-1"
                          onClick={() => onNavigate(`/?team=${team.id}`)}
                        >
                          View services
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmSlug(team.slug)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedTeam?.slug === team.slug && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {detailLoading ? (
                        <Skeleton className="h-32" />
                      ) : selectedTeam ? (
                        <>
                          {/* Members */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                Members ({selectedTeam._count.users})
                              </h4>
                              <button
                                onClick={() => { setAddUserSlug(team.slug); setAddUsername(""); setGrantRepoAccess(false); }}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                <UserPlus className="w-3 h-3" /> Add
                              </button>
                            </div>
                            {addUserSlug === team.slug && (
                              <>
                                <div className="flex gap-2 mb-2">
                                  <Input
                                    value={addUsername}
                                    onChange={(e) => setAddUsername(e.target.value)}
                                    placeholder="GitHub username or ID..."
                                    className="h-7 text-xs"
                                    onKeyDown={(e) => { if (e.key === "Enter") addMember(); }}
                                    autoFocus
                                  />
                                  <Button size="sm" className="h-7 text-xs gap-1" onClick={addMember} disabled={addingMember}>
                                    {addingMember ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                    Add
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAddUserSlug(null); setGrantRepoAccess(false); }}>
                                    Cancel
                                  </Button>
                                </div>
                                {selectedTeam && selectedTeam.services.some(s => "githubRepoUrl" in s && s.githubRepoUrl) && (
                                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      className="w-3.5 h-3.5 rounded"
                                      checked={grantRepoAccess}
                                      onChange={(e) => setGrantRepoAccess(e.target.checked)}
                                    />
                                    Grant GitHub repo access to all team repositories
                                    {grantRepoAccess && (
                                      <span className="text-amber-500">— you are about to give push access to {selectedTeam.services.filter(s => "githubRepoUrl" in s && s.githubRepoUrl).length} repo(s)</span>
                                    )}
                                  </label>
                                )}
                              </>
                            )}
                            {selectedTeam.users.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No members</p>
                            ) : (
                              <div className="space-y-1">
                                {selectedTeam.users.map((u) => (
                                  <div key={u.id} className="flex items-center justify-between text-sm py-1">
                                    <div className="flex items-center gap-2">
                                      {u.avatarUrl ? (
                                        <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                                      ) : (
                                        <Users className="w-4 h-4 text-muted-foreground" />
                                      )}
                                      <span>{u.username}</span>
                                      <Badge variant="secondary" className="text-[9px]">{u.role}</Badge>
                                    </div>
                                    <button
                                      onClick={() => removeMember(team.slug, u.id)}
                                      className="text-muted-foreground hover:text-destructive text-xs"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Services */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
                              Services ({selectedTeam._count.services})
                            </h4>
                            {selectedTeam.services.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No services</p>
                            ) : (
                              <div className="space-y-1.5">
                                {selectedTeam.services.map((svc) => (
                                  <div
                                    key={svc.id}
                                    className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors"
                                    onClick={() => onNavigate?.(`/services/${svc.slug}`)}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-medium truncate">{svc.name}</span>
                                      <StackBadge category={svc.category} languages={svc.languages} size="sm" />
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <StatusBadge status={svc.status as "provisioning" | "ready" | "failed"} />
                                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center py-6">
                          <CircleDot className="w-6 h-6 text-muted-foreground/50 mb-2" />
                          <p className="text-xs text-muted-foreground">Could not load team details</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmSlug !== null}
        title="Delete team"
        message="This action cannot be undone. The team will be permanently removed. All members will be unassigned."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmSlug(null)}
      />
    </div>
  );
}
