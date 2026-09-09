import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { CheckResult } from "@/features/setup/setupGuide";

interface SetupStatus {
  checks: Record<string, CheckResult>;
}

export function SetupIncompleteBanner({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [incomplete, setIncomplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SetupStatus>("/api/setup/check")
      .then((data) => {
        if (!cancelled) {
          setIncomplete(Object.values(data.checks).some((check) => check.required && !check.ok));
        }
      })
      .catch(() => {
        if (!cancelled) setIncomplete(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!incomplete) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 mb-6">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-xs text-amber-800 flex-1">
        Your setup is incomplete — configure your connections before creating services.
      </p>
      <button
        onClick={() => onNavigate("/setup")}
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline shrink-0"
      >
        Fix setup <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}