import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export interface ValidateResult {
  ok: boolean;
  message: string;
  detail?: string;
}

interface TokenValidateFieldProps {
  provider: "github" | "gitlab" | "terraform";
  validate: (token: string) => Promise<ValidateResult>;
}

export function TokenValidateField({ provider, validate }: TokenValidateFieldProps) {
  const [token, setToken] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const submittedTokenRef = useRef("");

  const runValidation = async () => {
    if (!token.trim()) return;
    const submitted = token.trim();
    submittedTokenRef.current = submitted;
    setValidating(true);
    setResult(null);
    try {
      const res = await validate(submitted);
      if (submittedTokenRef.current === submitted) {
        setResult(res);
      }
    } catch {
      if (submittedTokenRef.current === submitted) {
        setResult({ ok: false, message: "Validation failed" });
      }
    } finally {
      if (submittedTokenRef.current === submitted) {
        setValidating(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setResult(null);
          }}
          placeholder={`Paste your ${provider} token...`}
          className="flex-1 h-9 px-3 rounded-md border bg-background text-sm outline-none focus:border-primary"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={runValidation}
          disabled={!token.trim() || validating}
          className="gap-1.5"
        >
          {validating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Validate
        </Button>
      </div>
      {result && (
        <div className={`flex items-start gap-1.5 text-xs ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <div>
            <p>{result.message}</p>
            {result.detail && <p className="text-muted-foreground font-mono text-[10px] break-all">{result.detail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}