import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, ArrowRight } from "lucide-react";
import { SetupStep } from "./SetupStep";
import { orderChecks, TOKEN_PROVIDERS, type CheckResult } from "./setupGuide";
import type { ValidateResult } from "./TokenValidateField";

interface SetupStatus {
  timestamp: string;
  allOk: boolean;
  checks: Record<string, CheckResult>;
}

const serviceLabels: Record<string, string> = {
  database: "PostgreSQL",
  redis: "Redis",
  vault: "HashiCorp Vault",
  github: "GitHub API",
  githubOAuth: "GitHub OAuth",
  terraform: "Terraform Cloud",
  argocd: "Argo CD",
};

export function SetupPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<SetupStatus>("/api/setup/check");
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check setup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { checkSetup(); }, []);

  const requiredOk = status
    ? Object.values(status.checks).filter((check) => check.required).every((check) => check.ok)
    : false;

  const validateToken =
    (provider: "github" | "terraform") =>
    async (token: string): Promise<ValidateResult> => {
      return api.post<ValidateResult>("/api/setup/validate", { provider, token });
    };

  return (
    <div className="animate-fade-up max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Setup check</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configure your connections before creating your first service. Fix the required
        checks below — each one tells you exactly what to do.
      </p>

      {loading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Checking connections...</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 mb-4">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{error}</span>
            </div>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={checkSetup}>
              <RefreshCw className="w-3.5 h-3.5" />Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && status && (
        <>
          {status.allOk && (
            <Card className="border-emerald-200 mb-6">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-emerald-600 mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-semibold">All systems go!</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Every connection is working. You are ready to create your first service.
                </p>
                <Button size="sm" onClick={() => onNavigate("/new")} className="gap-1.5">
                  Create service <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          )}

          {!status.allOk && requiredOk && (
            <Card className="border-amber-200 mb-6">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="text-sm font-semibold">Optional services missing</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Core services are ready. Some optional integrations (Argo CD) are not configured.
                </p>
              </CardContent>
            </Card>
          )}

          {!status.allOk && !requiredOk && (
            <Card className="border-red-200 mb-6">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-red-600 mb-1">
                  <XCircle className="w-5 h-5" />
                  <span className="text-sm font-semibold">Configuration needed</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fix the required checks below, or workers will skip silently.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Connections</CardTitle>
                  <CardDescription>Required first, optional at the end</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={checkSetup}>
                  <RefreshCw className="w-3.5 h-3.5" />Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {orderChecks(status.checks).map(({ key, check }) => (
                  <SetupStep
                    key={key}
                    label={serviceLabels[key] ?? key}
                    check={check}
                    guideProvider={check.provider}
                    validate={
                      check.provider && TOKEN_PROVIDERS[check.provider]
                        ? validateToken(TOKEN_PROVIDERS[check.provider])
                        : undefined
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => onNavigate("/")}>Back to catalog</Button>
            {requiredOk && <Button size="sm" onClick={() => onNavigate("/new")} className="gap-1.5">Create service <ArrowRight className="w-3.5 h-3.5" /></Button>}
          </div>
        </>
      )}
    </div>
  );
}