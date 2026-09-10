# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue.

Instead, report it privately via:

- Email: erickmark996@gmail.com
- GitHub: [Security Advisories](https://github.com/Infraena/Infraena/security/advisories/new)

We will respond within 48 hours and work with you to verify and address the issue.

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| Latest  | :white_check_mark: |

## Security Best Practices for Users

- Never commit `.env` files (they are in `.gitignore`)
- Use a GitHub PAT with minimal scopes (`repo` + `delete_repo` for full functionality)
- Rotate your `JWT_SECRET` regularly in production (minimum 32 characters)
- Enable branch protection on all service repositories
- Review team member additions and repository access grants regularly

## Architecture Security

- **Authentication**: GitHub OAuth 2.0 + JWT via `jose`. Cookies are `httpOnly`, `secure` in production, `SameSite=Lax`, 7-day expiry. The OAuth flow uses a signed `state` cookie (login CSRF protection).
- **Authorization**: Login is restricted to members of `GITHUB_ORG` (when configured). Destructive/global operations (delete service, bulk-delete, team management, repo-access grant/revoke, inbound token regenerate) require the `admin` role (`ADMIN_LOGINS`; the first user bootstraps as admin on a fresh instance). See `docs/specs/spec-mvp6.md`.
- **Webhook inbound**: each service has a per-service token in the URL (32-byte hex, constant-time comparison, 404 on mismatch). Payload capped at 16 KB.
- **Rate Limiting**: 200 requests/minute per IP by default (`RATE_LIMIT_MAX`), with stricter limits on setup endpoints. Set `TRUST_PROXY=true` behind a reverse proxy/ingress so limits key on the real client IP.
- **Security headers**: The API sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (via `@fastify/helmet`; CSP disabled for the JSON API). The web container sets a CSP and the other headers in `apps/web/nginx.conf`.
- **SSRF**: user-controlled outbound URLs (health checks, outbound webhooks) are validated to block loopback, link-local, cloud-metadata and IPv4-mapped ranges; RFC1918 is allowed (internal health checks) and redirects are never followed. DNS-rebinding is a documented residual risk. See `lib/net.ts`.
- **WebSockets**: Socket.IO connections require a valid JWT (cookie or handshake auth) and can only join `catalog` or `service:<uuid>` rooms.
- **Workers**: Each worker (GitHub, GitLab, Terraform, Vault) verifies the service exists, is not a test user, and that the job target matches the service's registered repo/org before making external API calls.
- **Tests**: Test mode (`NODE_ENV=test` / `VITEST`) never enqueues real jobs and never calls external APIs. Test data is self-cleaned via `afterAll`.
- **Secrets**: All credentials are read from environment variables at startup; no secrets are embedded in source code. `setup.sh` generates a random `JWT_SECRET`, and the API refuses to start in production with a known placeholder secret.
- **Dependencies**: `pnpm audit --prod` reports no known vulnerabilities. Dev/build-only advisories may remain and are tracked in `docs/security-audit.md`.
- **Database**: PostgreSQL with Prisma. Migrations are version-controlled.

## Accepted limitations

- **Single-instance loops**: the health checker and Argo CD watcher run in-process; with multiple API replicas each would poll independently. Set `replicas: 1` for the API or accept duplicated polling.
- **DNS rebinding**: outbound URL validation resolves DNS once before the request; a host that changes its record between validation and connection is not re-checked.
- **GitLab access management**: team member repo-access grant/revoke is GitHub-only (users are identified by GitHub identity).
- **Local dev defaults**: `docker-compose.yml` ships dev credentials (Postgres password, Vault dev root token, Redis without auth) and binds to `127.0.0.1` only. Do not expose these services.
- **Vault AppRole**: the AppRole `secret_id` is stored inside the per-service KV secret; secret-id rotation is manual.
