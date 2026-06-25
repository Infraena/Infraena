# Infraena

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Infraena/Infraena/actions/workflows/ci.yml/badge.svg)](https://github.com/Infraena/Infraena/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-000000)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)

Infraena is a self-service Internal Developer Platform. Developers create
services with GitHub repos, Kubernetes namespaces and Vault secrets — all
from a web interface, without touching Terraform or kubectl.

## Quickstart

```bash
git clone https://github.com/Infraena/Infraena.git
cd Infraena
./setup.sh    # Start PostgreSQL, Redis, Vault via Docker. Install deps. Run migrations.
pnpm dev      # API :8080 + Web :3000
```

Open [http://localhost:3000](http://localhost:3000). Edit `apps/api/.env` with
your GitHub OAuth credentials to log in and create services.

> **No credentials?** You can still browse the catalog. GitHub, Terraform and
> Vault workers skip gracefully when tokens are missing.

## Features

- **Service catalog** — browse all services with filters by language, status,
  team and category. Column sorting, status counters, card/table view,
  multi-select and bulk delete.
- **Self-service creation** — wizard that provisions infrastructure in
  minutes. Multi-category language selection with per-stack badges. Dry-run
  preview shows exactly what will be created before confirming.
- **Modular provisioning** — choose which workers to run (GitHub, Terraform,
  Vault) per service. Re-provision missing or failed steps later.
- **Import existing repos** — bring your own GitHub repos into the platform
  with full provisioning applied retroactively.
- **Service detail** — inline editing of name and description, activity
  timeline, paginated deployments panel, health indicator, copy to clipboard.
- **Dependency graph** — define and visualize which services consume or are
  consumed by others, with autocomplete search.
- **Repository access management** — grant or revoke GitHub collaborator
  access per team member, independently of team membership.
- **Setup wizard** — health check for all 7 connections (PostgreSQL, Redis,
  Vault, GitHub API, GitHub OAuth, Terraform Cloud, Argo CD) before creating
  services.
- **Real-time progress** — WebSocket logs for every provisioning step.
- **GitHub OAuth** — log in with your GitHub account.
- **Async provisioning** (3 background workers):
  - **GitHub** — creates repo (from template or blank), adds branch
    protection and `infraena-managed` topic.
  - **Terraform Cloud** — creates workspace with variables.
  - **HashiCorp Vault** — enables KV mount, creates ACL policy and AppRole
    credentials.
- **Complete cleanup** — deleting a service also removes its GitHub
  repository and associated records.
- **Prometheus metrics** — HTTP requests, latency, job duration, error rates.
- **Grafana dashboard** — pre-built dashboard with 7 panels.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   React SPA  │-───▶│  Fastify API │────▶│  PostgreSQL  │
│   :3000      │     │  :8080       │     │              │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  GitHub  │ │  Terra   │ │  Vault   │
        │  Worker  │ │  Worker  │ │  Worker  │
        └──────────┘ └──────────┘ └──────────┘
              │             │             │
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  GitHub  │ │  Terra   │ │  Vault   │
        │   API    │ │  Cloud   │ │   API    │
        └──────────┘ └──────────┘ └──────────┘
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Fastify 5, Prisma 6, BullMQ 5 |
| Database | PostgreSQL 16 |
| Job queue | BullMQ on Redis 7 |
| Real-time | Socket.IO |
| Auth | GitHub OAuth 2.0 + JWT (jose) |
| Metrics | Prometheus (prom-client) |
| Infra | Kubernetes, Helm, Terraform Cloud, Argo CD |
| Secrets | HashiCorp Vault + External Secrets Operator |
| CI/CD | GitHub Actions, Docker, GHCR |

## Prerequisites

- Node.js >= 20 · pnpm >= 11 · Docker Desktop

## Environment variables

Edit `apps/api/.env` with your credentials (created automatically by `./setup.sh`):

```bash
# Required
DATABASE_URL=postgresql://infraena:infraena@localhost:5433/infraena
REDIS_URL=redis://localhost:6379
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=root
JWT_SECRET=<generate with: openssl rand -hex 32>

# GitHub OAuth (required for login)
GITHUB_CLIENT_ID=<your GitHub OAuth App client ID>
GITHUB_CLIENT_SECRET=<your GitHub OAuth App client secret>
GITHUB_ORG=<your GitHub username or organization>

# GitHub API (optional — worker skips if missing. Requires "repo" + "delete_repo" scopes)
GITHUB_TOKEN=<personal access token>

# Terraform Cloud (optional — worker skips if missing)
TERRAFORM_CLOUD_TOKEN=
TERRAFORM_ORG=
```

## GitHub OAuth setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App:
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:8080/auth/github/callback`
3. Copy the Client ID and Client Secret to `apps/api/.env`

## Testing

```bash
pnpm test  # requires postgres+redis
```

Tests are safe for development: they never enqueue real jobs in Redis nor
call external APIs (GitHub, Terraform, Vault). They self-clean on
completion — test services, jobs, deployments and teams are deleted from
the database.

## API Endpoints

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/auth/github` | Redirect to GitHub OAuth |
| GET | `/auth/github/callback` | Exchange code for JWT, set `infraena_token` cookie |
| GET | `/auth/me` | Return authenticated user or 401 |
| POST | `/auth/logout` | Clear cookie |

### Services
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/services` | List with filters: `?status=&language=&team=&category=&sort=&order=&page=&limit=` |
| GET | `/api/services/templates` | List available project templates |
| GET | `/api/services/preview` | Dry-run preview: `?name=&template=&provisioning=&enableBranchProtection=` |
| POST | `/api/services` | Create service, enqueue 3 workers |
| POST | `/api/services/import` | Import existing GitHub repo `{ repoUrl, teamId, provisioning?, enableBranchProtection? }` |
| POST | `/api/services/bulk-delete` | Bulk delete `{ ids: [...] }` with repo cleanup |
| GET | `/api/services/:slug` | Detail with team, owner, jobs, deployments |
| PATCH | `/api/services/:slug` | Edit name and/or description |
| DELETE | `/api/services/:slug` | Delete service, jobs, deployments, and GitHub repo |
| GET | `/api/services/:slug/activity` | Unified timeline of jobs + deployments |
| GET | `/api/services/:slug/jobs` | Provisioning job logs |
| GET | `/api/services/:slug/deployments` | Paginated deployment history (`?page=&limit=`) |
| POST | `/api/services/:slug/deploy` | Register new deployment + Argo CD sync if configured |
| POST | `/api/services/:slug/sync` | Manual Argo CD sync |
| POST | `/api/services/:slug/provision` | Re-provision missing or failed steps `{ steps?: [...], enableBranchProtection? }` |
| GET | `/api/services/:slug/dependencies` | Get dependency graph (`dependsOn` + `dependedOnBy`) |
| POST | `/api/services/:slug/dependencies` | Add dependency `{ targetSlug, type?, label? }` |
| DELETE | `/api/services/:slug/dependencies/:id` | Remove dependency |

### Teams
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/teams` | List with `_count` (services, users) |
| POST | `/api/teams` | Create team |
| PATCH | `/api/teams/:slug` | Rename team |
| GET | `/api/teams/:slug` | Detail with users, services, counts |
| POST | `/api/teams/:slug/members` | Add member. Optional `grantRepoAccess: true` adds GitHub collaborator. |
| DELETE | `/api/teams/:slug/members/:userId` | Remove member from team |
| POST | `/api/teams/:slug/repo-access` | Grant repo collaborator access `{ username }` |
| DELETE | `/api/teams/:slug/repo-access/:userId` | Revoke repo collaborator access |
| DELETE | `/api/teams/:slug` | Delete team (only if empty) |

### Other
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/setup/check` | Health check for all 7 connections |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

## WebSocket Events

Connect to the Socket.IO server for real-time updates:

- `job:update` — emitted on every provisioning step (`{ jobId, serviceId, type, status, log }`)
- `service:ready` — emitted when all jobs complete (`{ serviceId, slug, repoUrl }`)

Join the room `service:{serviceId}` to receive events for a specific service.

## Project Structure

```
infraena/
├── apps/
│   ├── api/              # Backend Fastify
│   │   ├── src/
│   │   │   ├── routes/   # REST endpoints
│   │   │   ├── workers/  # BullMQ workers (github, terraform, vault)
│   │   │   └── lib/      # Env, queue, socket, metrics, Prisma client
│   │   └── prisma/       # Schema + migrations
│   └── web/              # Frontend React
│       └── src/
│           ├── features/ # Pages: Catalog, Create, Detail, Teams
│           ├── components/ # UI: StackBadge, ConfirmDialog, LogTerminal + shadcn/ui
│           └── lib/      # API client, auth, WebSocket, utilities
├── packages/
│   └── shared-types/     # TypeScript DTOs (shared source, no build step)
├── templates/            # 27 project templates (Node.js, Go, React, etc.)
│   └── index.json        # Template catalog consumed by API and UI
├── cli/                  # CLI tool (create/list/delete/templates)
├── infra/
│   ├── terraform/        # Terraform modules (k8s-namespace, vault-mount)
│   ├── k8s/
│   │   ├── helm/idp/     # Helm chart (11 templates)
│   │   └── argocd/       # Argo CD manifests
│   └── grafana/          # Pre-built dashboard JSON
├── .github/workflows/    # CI (test+lint+build) + Release (docker+deploy)
├── setup.sh              # One-command onboarding
└── docker-compose.yml    # Local dev infrastructure
```

## Deployment

### Docker images

```bash
# API
docker build -t infraena-api apps/api

# Web
docker build -t infraena-web apps/web
```

### Kubernetes with Helm

```bash
helm upgrade --install infraena infra/k8s/helm/idp \
  --namespace infraena \
  --create-namespace \
  --set image.repository=ghcr.io/your-org \
  --set ingress.hosts[0].host=infraena.your-domain.com
```

The Helm chart deploys the API and web with ingress, TLS via cert-manager,
HPA, and ExternalSecrets to pull credentials from Vault.

## Metrics

Prometheus metrics exposed at `/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | HTTP requests by method, route, status |
| `http_request_duration_seconds` | Histogram | Latency distribution |
| `idp_provision_jobs_total` | Counter | Jobs by type and status |
| `idp_provision_job_duration_seconds` | Histogram | Job duration by type |
| `idp_services` | Gauge | Active services by status |
| `idp_ws_connections` | Gauge | Active WebSocket connections |

The pre-built Grafana dashboard is at `infra/grafana/idp-dashboard.json`.

## License

MIT
