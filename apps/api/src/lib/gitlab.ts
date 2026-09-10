import type { RepoProvider } from "@infraena/shared-types";

export type GitLabNamespace = { namespaceId?: number; usedFallback: boolean };

export type CommitAction = {
  action: "create";
  file_path: string;
  content: string;
};

export function gitlabApiUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/api/v4/${path.replace(/^\/+/, "")}`;
}

export function detectRepoProvider(url: string, gitlabBase: string): RepoProvider | null {
  try {
    const host = new URL(url).host.toLowerCase();
    if (host === "github.com" || host === "www.github.com") return "github";
    const gitlabHost = new URL(gitlabBase).host.toLowerCase();
    if (host === gitlabHost || host === "gitlab.com") return "gitlab";
    return null;
  } catch {
    return null;
  }
}

export function encodeProjectPath(path: string): string {
  return encodeURIComponent(path);
}

export function parseRepoPath(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    const cleaned = pathname.replace(/\.git$/, "");
    return cleaned || null;
  } catch {
    return null;
  }
}

export async function resolveNamespace(
  gitlabUrl: string,
  token: string,
  group: string | undefined,
  fetchFn: typeof fetch = fetch
): Promise<GitLabNamespace> {
  if (!group) return { usedFallback: true };
  try {
    const res = await fetchFn(gitlabApiUrl(gitlabUrl, `groups/${encodeProjectPath(group)}`), {
      headers: { "PRIVATE-TOKEN": token },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { usedFallback: true };
    const data = (await res.json()) as { id?: number };
    if (typeof data.id !== "number") return { usedFallback: true };
    return { namespaceId: data.id, usedFallback: false };
  } catch {
    return { usedFallback: true };
  }
}

export function buildProjectPayload(slug: string, namespaceId?: number) {
  return {
    name: slug,
    path: slug,
    visibility: "private",
    initialize_with_readme: false,
    ...(namespaceId ? { namespace_id: namespaceId } : {}),
  };
}

export function buildCommitActions(files: Map<string, string>, slug: string): CommitAction[] {
  const actions: CommitAction[] = [];
  for (const [filePath, rawContent] of files) {
    if (filePath === "template.json") continue;
    actions.push({
      action: "create",
      file_path: filePath,
      content: rawContent.replace(/\{\{serviceName\}\}/g, slug),
    });
  }
  return actions;
}
