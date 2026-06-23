import { useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Service, ServiceCategory } from "@idp/shared-types";
import { CATEGORIES } from "@idp/shared-types";
import { api } from "@/lib/api";
import { useProvisionLogs } from "@/lib/websocket";
import { LogTerminal } from "@/components/LogTerminal";
import { StatusBadge } from "@/components/StatusBadge";
import { StackBadge } from "@/components/StackBadge";
import { TechIcon } from "@/components/TechIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Box,
  ExternalLink,
  Github,
  Server,
  Key,
} from "lucide-react";

const categoryKeys = Object.keys(CATEGORIES) as ServiceCategory[];

const langToCategory = new Map<string, ServiceCategory>();
for (const cat of categoryKeys) {
  for (const lang of CATEGORIES[cat]) {
    langToCategory.set(lang, cat);
  }
}

const formSchema = z.object({
  name: z.string().min(3).max(40).regex(/^[a-z][a-z0-9-]*$/, "Only lowercase, numbers and hyphens"),
  description: z.string().max(200).optional(),
  teamId: z.string().min(1, "Team is required"),
  category: z.enum(categoryKeys as [ServiceCategory, ...ServiceCategory[]], { errorMap: () => ({ message: "Select a category" }) }),
  languages: z.array(z.string()),
  template: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Team {
  id: string;
  name: string;
  slug: string;
}

interface Template {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string;
  icon: string;
}

const categoryLabels: Record<ServiceCategory, string> = {
  frontend: "Frontend",
  backend: "Backend",
  database: "Database",
  infrastructure: "Infrastructure",
  mobile: "Mobile",
  other: "Other",
};

const languageLabels: Record<string, string> = {
  react: "React", vue: "Vue", angular: "Angular", nextjs: "Next.js",
  svelte: "Svelte", remix: "Remix", astro: "Astro",
  nodejs: "Node.js", go: "Go", python: "Python", java: "Java",
  rust: "Rust", dotnet: ".NET", elixir: "Elixir",
  postgresql: "PostgreSQL", mongodb: "MongoDB", redis: "Redis",
  mysql: "MySQL", clickhouse: "ClickHouse", neo4j: "Neo4j",
  terraform: "Terraform", docker: "Docker", kubernetes: "Kubernetes",
  "react-native": "React Native", flutter: "Flutter",
  custom: "Custom",
};

export function CreateServicePage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [step, setStep] = useState<"form" | "review" | "provisioning" | "done">("form");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [result, setResult] = useState<Service | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<string[]>(["github", "terraform", "vault"]);
  const [enableBranchProtection, setEnableBranchProtection] = useState(true);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  const logs = useProvisionLogs(serviceId);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { category: "frontend", languages: [], template: undefined },
  });

  const watchedLangs = useWatch({ control, name: "languages" }) as string[];
  const formName = useWatch({ control, name: "name" }) as string | undefined;

  useEffect(() => {
    api.get<Team[]>("/api/teams").then(setTeams).catch(() => {});
    api.get<Template[]>("/api/services/templates").then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    const firstLangCat = watchedLangs.length > 0
      ? (langToCategory.get(watchedLangs[0]) ?? "backend")
      : "backend";
    setValue("category", firstLangCat, { shouldValidate: false });
  }, [watchedLangs, setValue]);

  const loadPreview = async (data: FormData) => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("name", data.name);
      params.set("teamId", data.teamId);
      params.set("template", selectedTemplate ?? data.languages?.[0] ?? data.category);
      params.set("provisioning", provisioning.join(","));
      params.set("enableBranchProtection", String(enableBranchProtection));
      const p = await api.get<Record<string, unknown>>(`/api/services/preview?${params.toString()}`);
      setPreview(p);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
    }
  };

  const onConfirm = async () => {
    setError(null);
    setStep("provisioning");
    const data = getValues();
    try {
      const payload = {
        name: data.name,
        description: data.description,
        teamId: data.teamId,
        category: data.category,
        languages: data.languages,
        template: selectedTemplate ?? data.languages?.[0] ?? data.category,
        provisioning,
        enableBranchProtection,
      };
      const service = await api.post<Service>("/api/services", payload);
      setResult(service);
      setServiceId(service.id);
      if (provisioning.length === 0) {
        setStep("done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service");
      setStep("form");
    }
  };

  useEffect(() => {
    if (!serviceId || !result) return;

    const interval = setInterval(async () => {
      try {
        const jobs = await api.get<{ status: string }[]>(
          `/api/services/${result.slug}/jobs`
        );
        const allDone = jobs.every((j) => j.status === "success" || j.status === "failed");
        if (allDone && jobs.length > 0 && jobs.length >= provisioning.length) {
          const svc = await api.get<Service>(`/api/services/${result.slug}`);
          setResult(svc);
          setStep("done");
          clearInterval(interval);
        }
      } catch {}
    }, 2500);

    return () => clearInterval(interval);
  }, [serviceId, result]);

  if (step === "done" && result) {
    const success = result.status === "ready";

    return (
      <div className="max-w-2xl mx-auto animate-fade-up">
        <Card className={success ? "border-emerald-200" : "border-red-200"}>
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              {success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <Box className="w-5 h-5 text-amber-500" />
              )}
              <CardTitle>
                {success ? "Provisioned successfully" : "Provisioning completed with issues"}
              </CardTitle>
            </div>
            <CardDescription>
              <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">
                {result.slug}
              </span>
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <StackBadge category={result.category} languages={result.languages} />
              <StatusBadge status={result.status as typeof result.status} />
            </div>

            {result.githubRepoUrl && (
              <a
                href={result.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View GitHub repository
              </a>
            )}
          </CardContent>

          <CardFooter className="gap-3">
            <Button variant="outline" onClick={() => onNavigate("/")}>
              Back to catalog
            </Button>
            <Button onClick={() => onNavigate(`/services/${result.slug}`)}>
              View details
            </Button>
          </CardFooter>
        </Card>

        <div className="mt-6 space-y-3">
          {(provisioning as ("github" | "terraform" | "vault")[]).map((type) => (
            <details key={type} className="group">
              <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors capitalize">
                {type} logs ({(logs[type] ?? []).length} entries)
              </summary>
              <div className="mt-1">
                <LogTerminal logs={logs[type] ?? []} />
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  }

  if (step === "provisioning") {
    return (
      <div className="max-w-2xl mx-auto animate-fade-up">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <CardTitle>Provisioning {formName || result?.name || "service"}...</CardTitle>
            </div>
            <CardDescription>
              This may take a couple of minutes. You can watch the logs below.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {(provisioning as ("github" | "terraform" | "vault")[]).map((type) => {
              const typeLogs = logs[type] ?? [];
              const lastLog = typeLogs[typeLogs.length - 1] ?? "";
              const isRunning = typeLogs.length > 0 && !lastLog.includes("completed") && !lastLog.includes("successfully");
              const isDone = typeLogs.length > 0 && (lastLog.includes("completed") || lastLog.includes("successfully"));

              return (
                <div key={type}>
                  <h3 className="text-xs font-medium mb-1.5 flex items-center gap-2 capitalize">
                    {isRunning ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    ) : isDone ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                    )}
                    {type}
                  </h3>
                  <LogTerminal logs={typeLogs} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "review" && preview) {
    const github = (preview as Record<string, unknown>).github as Record<string, unknown> | undefined;
    const terraform = (preview as Record<string, unknown>).terraform as Record<string, unknown> | undefined;
    const vault = (preview as Record<string, unknown>).vault as Record<string, unknown> | undefined;

    return (
      <div className="max-w-2xl mx-auto animate-fade-up">
        <div className="mb-8">
          <button onClick={() => setStep("form")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="w-3.5 h-3.5" />Back to form
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This is what will be provisioned for <strong>{String(preview.slug)}</strong>.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {Boolean(github?.["willProvision"]) && (
            <Card className={github?.["willCreateRepo"] ? "border-emerald-200" : "border-amber-200"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Github className="w-4 h-4" />GitHub
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>Repo: <span className="text-foreground font-mono">{String(github?.["org"])}/{String(github?.["repo"])}</span></p>
                <p>Template: <span className="text-foreground">{String(github?.["template"])}</span></p>
                <p>Branch protection: <span className={github?.["enableBranchProtection"] ? "text-emerald-600 font-medium" : "text-muted-foreground"}>{github?.["enableBranchProtection"] ? "Enabled" : "Disabled"}</span></p>
                {Boolean(github?.["notes"]) && <p className="text-amber-600">{String(github?.["notes"])}</p>}
              </CardContent>
            </Card>
          )}
          {Boolean(terraform?.["willProvision"]) && (
            <Card className={terraform?.["willCreate"] ? "border-emerald-200" : "border-amber-200"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="w-4 h-4" />Terraform Cloud
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>Workspace: <span className="text-foreground font-mono">{String(terraform?.["workspace"])}</span></p>
                <p>Org: <span className="text-foreground">{String(terraform?.["org"])}</span></p>
                {Boolean(terraform?.["notes"]) && <p className="text-amber-600">{String(terraform?.["notes"])}</p>}
              </CardContent>
            </Card>
          )}
          {Boolean(vault?.["willProvision"]) && (
            <Card className={vault?.["willEnable"] ? "border-emerald-200" : "border-amber-200"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Key className="w-4 h-4" />HashiCorp Vault
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>Mount: <span className="text-foreground font-mono">{String(vault?.["mountPath"])}</span></p>
                <p>Policy: <span className="text-foreground font-mono">{String(vault?.["policyName"])}</span></p>
                {Boolean(vault?.["notes"]) && <p className="text-amber-600">{String(vault?.["notes"])}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep("form")}>Back</Button>
          <Button size="sm" onClick={onConfirm} className="gap-1.5">
            Confirm & create <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-up">
      <div className="mb-8">
        <button
          onClick={() => onNavigate("/")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to catalog
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">New service</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Provision infrastructure, repository and secrets automatically.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 mb-6 text-sm">
          {error}
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit(loadPreview)}>
          <CardContent className="pt-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input {...register("name")} placeholder="my-service" className="font-mono" />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers and hyphens. Used as repo and namespace name.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input {...register("description")} placeholder="What does this service do?" />
            </div>

            {templates.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Template</label>
                  {selectedTemplate && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedTemplate(null)}
                    >
                      Clear selection
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-[300px] overflow-y-auto">
                  {templates.map((tpl) => (
                    <button
                      type="button"
                      key={tpl.id}
                      onClick={() => {
                        setSelectedTemplate(tpl.id);
                        setValue("category", tpl.category, { shouldValidate: false });
                        setValue("languages", [tpl.id], { shouldValidate: false });
                      }}
                      className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border text-left transition-all ${
                        selectedTemplate === tpl.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-input hover:border-primary/50 hover:bg-secondary/30"
                      }`}
                    >
                      <span className="w-5 h-5"><TechIcon icon={tpl.icon} /></span>
                      <span className="text-xs font-semibold">{tpl.name}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{tpl.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <label className="text-sm font-medium">Languages / Technologies</label>
              {categoryKeys.map((cat) => (
                <div key={cat}>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {categoryLabels[cat]}
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mt-1.5">
                    {CATEGORIES[cat].map((lang) => {
                      const selected = watchedLangs.includes(lang);
                      return (
                        <button
                          type="button"
                          key={lang}
                          onClick={() => {
                            const current = getValues("languages") ?? [];
                            const idx = current.indexOf(lang);
                            const next = idx >= 0
                              ? current.filter((_, i) => i !== idx)
                              : [...current, lang];
                            setValue("languages", next, { shouldValidate: false });
                          }}
                          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border text-sm cursor-pointer transition-all ${
                            selected
                              ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                              : "border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          {languageLabels[lang] ?? lang}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Provisioning</label>
              <p className="text-xs text-muted-foreground -mt-2">Select which infrastructure to provision for this service.</p>
              <div className="space-y-2">
                {([
                  { key: "github", label: "GitHub repository", desc: "Create repo, push template, add topic" },
                  { key: "terraform", label: "Terraform Cloud workspace", desc: "Create workspace + namespace variables" },
                  { key: "vault", label: "Vault secrets", desc: "Enable KV mount, ACL policy, AppRole" },
                ] as const).map(({ key, label, desc }) => {
                  const checked = provisioning.includes(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        checked
                          ? "border-primary bg-primary/5"
                          : "border-input bg-background hover:border-primary/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setProvisioning((prev) =>
                            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <div>
                        <span className="text-sm font-medium">{label}</span>
                        <p className="text-[11px] text-muted-foreground">{desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              {provisioning.includes("github") && (
                <label className="flex items-center gap-2 ml-7 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableBranchProtection}
                    onChange={(e) => setEnableBranchProtection(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary"
                  />
                  <span className="text-xs text-muted-foreground">Enable branch protection (requires admin permissions on repo)</span>
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Team</label>
              <select
                {...register("teamId")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a team...</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
              {errors.teamId && <p className="text-xs text-destructive">{errors.teamId.message}</p>}
            </div>
          </CardContent>

          <CardFooter className="border-t pt-5">
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>
              ) : (
                <>Review<ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
