import type { ServiceCategory, ServiceLanguage } from "@idp/shared-types";
import { CATEGORIES } from "@idp/shared-types";
import { cn } from "@/lib/utils";

interface StackBadgeProps {
  category: ServiceCategory;
  languages?: ServiceLanguage[] | string[];
  size?: "sm" | "default";
}

const categoryColors: Record<ServiceCategory, string> = {
  frontend: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  backend: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  database: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  infrastructure: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  mobile: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  other: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800",
};

const categoryLabels: Record<ServiceCategory, string> = {
  frontend: "Frontend",
  backend: "Backend",
  database: "Database",
  infrastructure: "Infra",
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

const langToCategory = new Map<string, ServiceCategory>();
for (const cat of Object.keys(CATEGORIES) as ServiceCategory[]) {
  for (const lang of CATEGORIES[cat]) {
    langToCategory.set(lang, cat);
  }
}

export function StackBadge({ category, languages, size = "default" }: StackBadgeProps) {
  const langs = languages ?? [];

  const grouped = new Map<ServiceCategory, string[]>();
  for (const lang of langs) {
    const cat = langToCategory.get(lang) ?? category;
    const group = grouped.get(cat) ?? [];
    group.push(lang);
    grouped.set(cat, group);
  }

  if (langs.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
          size === "sm" && "px-1.5 py-0.5 text-[10px]",
          categoryColors[category]
        )}
      >
        <span className="font-semibold">{categoryLabels[category]}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {[...grouped.entries()].map(([cat, groupLangs]) => (
        <span
          key={cat}
          className={cn(
            "inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
            size === "sm" && "px-1.5 py-0.5 text-[10px]",
            categoryColors[cat]
          )}
        >
          <span className={cn(
            "uppercase opacity-60 shrink-0",
            size === "sm" ? "text-[9px]" : "text-[10px]"
          )}>
            {categoryLabels[cat]}
          </span>
          {groupLangs.map((lang) => (
            <span key={lang} className="font-semibold whitespace-nowrap">
              {languageLabels[lang] ?? lang}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
