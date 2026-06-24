# Contributing to Infraena

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/Infraena/Infraena.git
cd Infraena
./setup.sh
pnpm dev
```

Opens API at `http://localhost:8080` and web at `http://localhost:3000`.

## Project Structure

```
├── apps/
│   ├── api/                 # Fastify 5 backend
│   │   ├── src/
│   │   │   ├── routes/      # REST endpoints (services, teams, auth, setup)
│   │   │   ├── workers/     # BullMQ workers (github, terraform, vault)
│   │   │   ├── db/          # Prisma client singleton
│   │   │   └── lib/         # Env, auth, queue, socket, metrics
│   │   └── prisma/          # Schema + migrations
│   └── web/                 # React 18 + Vite 6 frontend
│       └── src/
│           ├── features/    # Pages: catalog, create, service detail, teams, setup
│           ├── components/  # UI: StackBadge, StatusBadge, LogTerminal, + shadcn/ui
│           └── lib/         # API client, auth hooks, WebSocket, utils
├── packages/
│   └── shared-types/        # TypeScript types shared between api and web
├── templates/               # 27 project templates (Node.js, Go, Python, etc.)
│   └── index.json           # Template catalog consumed by API and UI
├── cli/                     # CLI tool (idp create/list/delete/templates/login)
├── .github/workflows/       # CI (lint, typecheck, test, build) + Release (Docker, deploy)
├── docker-compose.yml       # PostgreSQL :5433, Redis :6379, Vault :8200
└── setup.sh                 # One-command onboarding
```

## Development Workflow

1. **Start infrastructure** — `docker compose up -d` (PostgreSQL :5433, Redis :6379, Vault :8200)
2. **Run both apps** — `pnpm dev` (API :8080 + Web :3000)
3. **Generate Prisma client** — `pnpm db:generate` (needed after schema changes)
4. **Run tests** — `pnpm test` (requires PostgreSQL + Redis running)
5. **Run lint** — `pnpm lint`
6. **Build** — `pnpm build`

## Key Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start API + Web with Turborepo |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:push` | Sync schema without migrations (dev only) |
| `pnpm lint` | Type-check all packages (`tsc --noEmit`) |
| `pnpm test` | Run all tests (needs postgres+redis) |
| `pnpm build` | Build all packages |

## Conventions

- **ESM only** — all packages use `"type": "module"`. Imports need `.js` extension even in `.ts` files.
- **TypeScript strict** — `strict: true`. No `any` without explicit reason.
- **Zod validation** — backend uses Zod for request validation. Frontend shares schemas via `@idp/shared-types`.
- **Commits** — present tense, concise: "Add feature X", "Fix bug Y".
- **No secrets in code** — all credentials come from `process.env`, validated at startup.
- **Workers skip gracefully** — missing tokens mean the worker marks the job as success without making API calls.

## Architecture

The API runs 3 BullMQ workers in the same process as the HTTP server:

| Worker | What it does |
|--------|-------------|
| **GitHub** | Creates repo, pushes template files, adds `infraena-managed` topic, configures branch protection |
| **Terraform Cloud** | Creates workspace, sets namespace and team variables |
| **Vault** | Enables KV v2 mount, creates ACL policy, generates AppRole credentials |

Each worker is idempotent and has 3 safety layers: (1) skips if env credentials missing, (2) skips if `NODE_ENV=test`/`VITEST`, (3) skips if service was deleted or belongs to test user.

## Frontend Routing

The SPA uses manual routing via `window.history.pushState` + `popstate` (not TanStack Router):

| Route | Page |
|-------|------|
| `/` | CatalogPage |
| `/new` | CreateServicePage |
| `/services/:slug` | ServiceDetailPage |
| `/teams` | TeamsPage |
| `/setup` | SetupPage (connection health checks) |

## Adding a new template

1. Create a directory under `templates/<language>/`
2. Add `template.json` with name and category
3. Add starter files (README.md, .gitignore, Dockerfile, CI config, source files)
4. Update `templates/index.json` with the new entry
5. The template will appear in the service creation UI automatically
6. Template files can use `{{serviceName}}` which gets replaced with the service slug

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include test coverage for new features
- Run `pnpm lint` and `pnpm test` before pushing
- CI must be green before merging

## Questions?

Open a [GitHub Discussion](https://github.com/Infraena/Infraena/discussions) or join the community.
