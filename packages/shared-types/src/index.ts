export interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface User {
  id: string;
  githubId: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  teamId: string | null;
  role: "member" | "admin";
  createdAt: string;
}

export const CATEGORIES = {
  frontend: ["react", "vue", "angular", "nextjs", "svelte", "remix", "astro"],
  backend: ["nodejs", "go", "python", "java", "rust", "dotnet", "elixir"],
  database: ["postgresql", "mongodb", "redis", "mysql", "clickhouse", "neo4j"],
  infrastructure: ["terraform", "docker", "kubernetes"],
  mobile: ["react-native", "flutter"],
  other: ["custom"],
} as const;

export type ServiceCategory = keyof typeof CATEGORIES;
export type ServiceLanguage = (typeof CATEGORIES)[ServiceCategory][number];
export type ServiceStatus = "provisioning" | "ready" | "failed" | "imported";
export type ProvisioningStep = "github" | "terraform" | "vault";
export type JobType = ProvisioningStep;
export type JobStatus = "pending" | "running" | "success" | "failed";
export type DeploymentStatus = "pending" | "running" | "success" | "failed";
export type Environment = "staging" | "production";

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: ServiceCategory;
  languages: ServiceLanguage[];
  teamId: string;
  ownerId: string;
  githubRepoUrl: string | null;
  provisioning: ProvisioningStep[];
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
  lastDeployment?: {
    id: string;
    version: string;
    environment: string;
    status: string;
    createdAt: string;
  } | null;
}

export interface ProvisionJob {
  id: string;
  serviceId: string;
  type: JobType;
  status: JobStatus;
  logs: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface Deployment {
  id: string;
  serviceId: string;
  version: string;
  environment: Environment;
  status: DeploymentStatus;
  triggeredById: string | null;
  argocdApp: string | null;
  createdAt: string;
}

export interface CreateServiceInput {
  name: string;
  description?: string;
  teamId: string;
  category: ServiceCategory;
  languages?: ServiceLanguage[];
  template?: string;
}

export interface JobUpdateMessage {
  jobId: string;
  serviceId: string;
  type: JobType;
  status: JobStatus;
  log: string;
}

export interface ServiceReadyMessage {
  serviceId: string;
  slug: string;
  repoUrl: string;
}

export type DependencyType = "api" | "database" | "event" | "config";

export interface ServiceDependency {
  id: string;
  sourceServiceId: string;
  targetServiceId: string;
  sourceService?: { id: string; name: string; slug: string };
  targetService?: { id: string; name: string; slug: string };
  type: DependencyType;
  label: string | null;
  createdAt: string;
}
