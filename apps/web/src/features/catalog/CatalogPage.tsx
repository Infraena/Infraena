import { useState, useEffect, useMemo, useCallback } from "react";
import type { Service } from "@idp/shared-types";
import { CATEGORIES } from "@idp/shared-types";
import type { ServiceCategory } from "@idp/shared-types";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { StackBadge } from "@/components/StackBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, ArrowRight, PackageOpen, Plus, ChevronLeft, ChevronRight, Filter, X, Trash2, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, LayoutGrid, List } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PaginatedResponse {
  data: Service[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  counters: Record<string, number>;
}

const languageLabels: Record<string, string> = {
  react: "React", vue: "Vue", angular: "Angular", nextjs: "Next.js",
  svelte: "Svelte", remix: "Remix", astro: "Astro",
  nodejs: "Node.js", go: "Go", python: "Python", java: "Java",
  rust: "Rust", dotnet: ".NET", elixir: "Elixir",
  postgresql: "PostgreSQL", mongodb: "MongoDB", redis: "Redis",
  mysql: "MySQL", clickhouse: "ClickHouse", neo4j: "Neo4j",
  terraform: "Terraform", docker: "Docker", kubernetes: "Kubernetes",
  "react-native": "React Native", flutter: "Flutter", custom: "Custom",
};

const statuses: string[] = ["provisioning", "ready", "failed"];

export function CatalogPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [languageFilters, setLanguageFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [teamFilter, setTeamFilter] = useState<string>(
    () => new URLSearchParams(window.location.search).get("team") ?? ""
  );
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sort, setSort] = useState<"created" | "name" | "status">("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    languageFilters.forEach((l) => params.append("language", l));
    if (statusFilter) params.set("status", statusFilter);
    if (teamFilter) params.set("team", teamFilter);
    params.set("page", String(page));
    params.set("limit", "20");
    params.set("sort", sort);
    params.set("order", sortOrder);

    try {
      const res = await api.get<PaginatedResponse>(`/api/services?${params.toString()}`);
      setServices(res.data);
      setPagination(res.pagination);
      setCounters(res.counters ?? {});
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [languageFilters, statusFilter, teamFilter, page, sort, sortOrder]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const filtered = useMemo(() => {
    if (!search) return services;
    return services.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [services, search]);

  const toggleLanguage = (lang: string) => {
    setLanguageFilters((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
    setPage(1);
  };

  const clearFilters = () => {
    setLanguageFilters([]);
    setStatusFilter("");
    setPage(1);
    setSearch("");
  };

  const hasActiveFilters = languageFilters.length > 0 || statusFilter || search;

  const handleDelete = async (slug: string) => {
    setDeletingSlug(slug);
    try {
      await api.delete(`/api/services/${slug}`);
      fetchServices();
    } catch {} finally {
      setDeletingSlug(null);
      setConfirmDelete(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      await api.post("/api/services/bulk-delete", { ids: [...selected] });
      setSelected(new Set());
      fetchServices();
    } catch {} finally {
      setBulkDeleting(false);
    }
  };

  const handleSort = (field: "created" | "name" | "status") => {
    if (sort === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sort !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortOrder === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="text-sm text-muted-foreground mt-1">{pagination.total} service{pagination.total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selected.size})
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={fetchServices} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <div className="flex border rounded-md">
            <button
              onClick={() => setViewMode("table")}
              className={cn("px-2 py-1.5 text-xs transition-colors rounded-l-md", viewMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
            ><List className="w-3.5 h-3.5" /></button>
            <button
              onClick={() => setViewMode("cards")}
              className={cn("px-2 py-1.5 text-xs transition-colors rounded-r-md", viewMode === "cards" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
            ><LayoutGrid className="w-3.5 h-3.5" /></button>
          </div>
          <Button onClick={() => onNavigate("/new")} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />New
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>

            <div className="flex gap-1.5">
              {statuses.map((s) => {
                const count = counters?.[s] ?? 0;
                return (
                  <button key={s} onClick={() => { setStatusFilter(statusFilter === s ? "" : s); setPage(1); }}
                    className={cn(
                      "px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors capitalize flex items-center gap-1.5",
                      statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-secondary"
                    )}>
                    {s}
                    <span className={cn("text-[10px] rounded-full px-1", statusFilter === s ? "bg-primary-foreground/20" : "bg-secondary")}>{count}</span>
                  </button>
                );
              })}
            </div>

            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-3.5 h-3.5" />
              Languages
              {languageFilters.length > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {languageFilters.length}
                </span>
              )}
            </Button>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={clearFilters}>
                <X className="w-3 h-3" />Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Filter by language</p>
              <div className="space-y-2">
                {(Object.keys(CATEGORIES) as ServiceCategory[]).map((cat) => (
                  <div key={cat} className="flex items-start gap-2">
                    <span className="text-[10px] uppercase text-muted-foreground/60 w-16 pt-1 shrink-0">{cat}</span>
                    <div className="flex flex-wrap gap-1">
                      {CATEGORIES[cat].map((lang) => {
                        const active = languageFilters.includes(lang);
                        return (
                          <button key={lang} onClick={() => toggleLanguage(lang)}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                              active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:border-primary/50 hover:text-foreground"
                            )}>
                            {languageLabels[lang] ?? lang}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48" /></div>
                <Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <PackageOpen className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No services found</p>
            <p className="text-xs text-muted-foreground mt-1">{hasActiveFilters ? "Try adjusting your filters." : "Create your first service to get started."}</p>
            {!hasActiveFilters && (
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => onNavigate("/new")}>
                <Plus className="w-3.5 h-3.5" />Create your first service
              </Button>
            )}
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {filtered.map((service) => (
              <div
                key={service.id}
                className="p-4 rounded-lg border hover:border-primary/50 hover:bg-secondary/30 cursor-pointer transition-all group"
                onClick={() => onNavigate(`/services/${service.slug}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium group-hover:text-primary transition-colors">{service.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{service.slug}</p>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
                {service.description && (
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{service.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <StackBadge category={service.category} languages={service.languages} size="sm" />
                </div>
                {service.lastDeployment && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Last deploy: {service.lastDeployment.version} to {service.lastDeployment.environment}</span>
                    <span>{formatDistanceToNow(new Date(service.lastDeployment.createdAt), { addSuffix: true })}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]">
                    <input type="checkbox" className="w-3.5 h-3.5 rounded" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                    <span className="inline-flex items-center">Name<SortIcon field="name" /></span>
                  </TableHead>
                  <TableHead>Stack</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>
                    <span className="inline-flex items-center">Status<SortIcon field="status" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("created")}>
                    <span className="inline-flex items-center">Created<SortIcon field="created" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((service) => (
                  <TableRow key={service.id} className="group">
                    <TableCell>
                      <input type="checkbox" className="w-3.5 h-3.5 rounded" checked={selected.has(service.id)} onChange={() => toggleSelect(service.id)} onClick={(e) => e.stopPropagation()} />
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={() => onNavigate(`/services/${service.slug}`)}>
                      <div>
                        <p className="font-medium group-hover:text-primary transition-colors">{service.name}</p>
                        {service.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{service.description}</p>}
                        {service.lastDeployment && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Last deploy: <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">{service.lastDeployment.version}</Badge> to {service.lastDeployment.environment} {formatDistanceToNow(new Date(service.lastDeployment.createdAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={() => onNavigate(`/services/${service.slug}`)}>
                      <StackBadge category={service.category} languages={service.languages} />
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={() => onNavigate(`/services/${service.slug}`)}>
                      <StatusBadge status={service.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs cursor-pointer" onClick={() => onNavigate(`/services/${service.slug}`)}>
                      {formatDistanceToNow(new Date(service.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {service.githubRepoUrl && (
                          <a href={service.githubRepoUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </a>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                          disabled={deletingSlug === service.slug}
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(service.slug); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete service"
        message="This action cannot be undone. All associated jobs and deployments will be removed."
        confirmLabel="Delete"
        variant="danger"
        loading={deletingSlug !== null}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
