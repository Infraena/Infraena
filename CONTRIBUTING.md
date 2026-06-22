# Contributing to IDP Platform

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/ErickMark18/IDP-Platform.git
cd IDP-Platform
./setup.sh
pnpm dev
```

## Project Structure

```
├── apps/
│   ├── api/         # Fastify 5 backend (routes, workers, Prisma)
│   └── web/         # React 18 + Vite 6 frontend
├── packages/
│   └── shared-types/ # TypeScript types shared between api and web
├── templates/        # 27 project templates (Node.js, Go, Python, React, etc.)
├── docs/             # Landing page and documentation
└── infra/            # Terraform modules, Helm charts, Grafana dashboards
```

## Development Workflow

1. **Start infrastructure** — `docker compose up -d` (PostgreSQL :5433, Redis :6379, Vault :8200)
2. **Run both apps** — `pnpm dev` (API :8080 + Web :3000)
3. **Run tests** — `pnpm test` (requires postgres+redis)

## Conventions

- **ESM only** — all packages use `"type": "module"`. Imports need `.js` extension.
- **Formatting** — the project uses ESLint + Prettier. Run `pnpm lint` before committing.
- **Commits** — concise, present tense: "Add feature X", "Fix bug Y".
- **TypeScript** — strict mode. No `any` without explicit reason.

## Adding a new template

1. Create a directory under `templates/<language>/`
2. Add `template.json` with name and category
3. Add starter files (README.md, .gitignore, language-specific files)
4. Update `templates/index.json` with the new entry
5. The template will appear in the service creation UI automatically

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include test coverage for new features
- Update the relevant documentation if needed
- CI must be green before merging

## Questions?

Open a [GitHub Discussion](https://github.com/ErickMark18/IDP-Platform/discussions) or join the community.
