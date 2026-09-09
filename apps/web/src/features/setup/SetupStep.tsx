import { useState } from "react";
import { ChevronDown, ExternalLink, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  providerGuides,
  TOKEN_PROVIDERS,
  buildEnvSnippet,
  type CheckResult,
} from "./setupGuide";
import { TokenValidateField, type ValidateResult } from "./TokenValidateField";

interface SetupStepProps {
  label: string;
  check: CheckResult;
  guideProvider?: CheckResult["provider"];
  validate?: (token: string) => Promise<ValidateResult>;
}

export function SetupStep({ label, check, guideProvider, validate }: SetupStepProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const guide = guideProvider ? providerGuides[guideProvider] : undefined;
  const tokenProvider = guideProvider ? TOKEN_PROVIDERS[guideProvider] : undefined;

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(buildEnvSnippet(check.envVars));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — snippet is still visible for manual copy
    }
  };

  return (
    <div className={cn("rounded-lg border p-3", check.ok ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
        </div>
        {!check.ok && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="gap-1 shrink-0"
          >
            {open ? "Hide" : "Fix this"}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
          </Button>
        )}
      </div>

      {open && guide && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
          <p className="text-xs font-semibold">{guide.title}</p>
          <ol className="space-y-1.5">
            {guide.steps.map((step, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-muted-foreground/60 shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {guide.links?.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {link.label} <ExternalLink className="w-3 h-3" />
            </a>
          ))}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">.env snippet</p>
              <button
                onClick={copySnippet}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-background/70 border rounded-md p-2 overflow-x-auto">
              {buildEnvSnippet(check.envVars)}
            </pre>
          </div>
          {tokenProvider && validate && (
            <TokenValidateField provider={tokenProvider} validate={validate} />
          )}
        </div>
      )}
    </div>
  );
}