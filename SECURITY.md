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

- **Authentication**: GitHub OAuth 2.0 + JWT via `jose`. Cookies are `httpOnly`.
- **Authorization**: Pre-handler middleware on all mutation endpoints.
- **Rate Limiting**: 200 requests/minute per IP on all endpoints.
- **Workers**: Each worker (GitHub, Terraform, Vault) verifies the service exists and is not a test user before making external API calls.
- **Tests**: Test mode (`NODE_ENV=test` / `VITEST`) never enqueues real jobs. Test data is self-cleaned via `afterAll`.
- **Secrets**: All credentials are read from environment variables at startup. No secrets are embedded in source code.
- **Database**: PostgreSQL with Prisma. Migrations are version-controlled.
