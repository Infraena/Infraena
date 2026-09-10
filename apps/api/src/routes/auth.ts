import { FastifyInstance } from "fastify";
import { env } from "../lib/env.js";
import { prisma } from "../db/prisma.js";
import * as jose from "jose";
import { randomBytes, createHash, timingSafeEqual } from "crypto";

const JWT_EXPIRATION = "7d";
const OAUTH_STATE_COOKIE = "infraena_oauth_state";

function statesEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function exchangeCodeForToken(code: string) {
  const response = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    }
  );

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(data.error ?? "Failed to exchange code for token");
  }

  return data.access_token;
}

async function fetchGitHubUser(accessToken: string) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch GitHub user");
  }

  return response.json() as Promise<{
    id: number;
    login: string;
    email: string | null;
    avatar_url: string;
  }>;
}

export async function isOrgMember(accessToken: string, org: string, login: string) {
  const response = await fetch(
    `https://api.github.com/orgs/${org}/members/${login}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    }
  );
  return response.status === 204;
}

async function signJWT(payload: Record<string, unknown>) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secret);
}

async function verifyJWT(token: string) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as { sub: string; username: string; role: string };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/github", async (_request, reply) => {
    if (!env.GITHUB_CLIENT_ID) {
      return reply.status(500).send({ error: "GITHUB_CLIENT_ID not configured" });
    }

    const state = randomBytes(16).toString("hex");
    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 300,
    });

    const base = env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`;
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", `${base}/auth/github/callback`);
    return reply.redirect(url.toString());
  });

  app.get("/github/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    const expectedState = request.cookies[OAUTH_STATE_COOKIE];
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

    if (!code) {
      return reply.status(400).send({ error: "Missing code parameter" });
    }
    if (!state || !expectedState || !statesEqual(state, expectedState)) {
      return reply.status(400).send({ error: "Invalid OAuth state" });
    }

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return reply
        .status(500)
        .send({ error: "GitHub OAuth not configured" });
    }

    try {
      const accessToken = await exchangeCodeForToken(code);
      const ghUser = await fetchGitHubUser(accessToken);

      if (env.GITHUB_ORG) {
        const member = await isOrgMember(accessToken, env.GITHUB_ORG, ghUser.login);
        if (!member) {
          return reply
            .status(403)
            .send({ error: `Access denied: @${ghUser.login} is not a member of ${env.GITHUB_ORG}` });
        }
      }

      const existing = await prisma.user.findUnique({
        where: { githubId: String(ghUser.id) },
        select: { role: true },
      });

      let role = existing?.role === "admin" ? "admin" : "member";
      if (env.ADMIN_LOGINS.includes(ghUser.login)) {
        role = "admin";
      } else if (!existing && env.ADMIN_LOGINS.length === 0) {
        const admins = await prisma.user.count({ where: { role: "admin" } });
        if (admins === 0) role = "admin";
      }

      const user = await prisma.user.upsert({
        where: { githubId: String(ghUser.id) },
        update: {
          username: ghUser.login,
          email: ghUser.email,
          avatarUrl: ghUser.avatar_url,
          role,
        },
        create: {
          githubId: String(ghUser.id),
          username: ghUser.login,
          email: ghUser.email,
          avatarUrl: ghUser.avatar_url,
          role,
        },
      });

      const token = await signJWT({
        sub: user.id,
        username: user.username,
        role: user.role,
      });

      reply.setCookie("infraena_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return reply.redirect(`${env.CORS_ORIGIN}/`);
    } catch (error) {
      app.log.error(error);
      return reply
        .status(500)
        .send({ error: "Authentication failed" });
    }
  });

  app.get("/me", async (request, reply) => {
    const token =
      request.cookies.infraena_token ??
      request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    try {
      const payload = await verifyJWT(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { team: true },
      });

      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      return { user };
    } catch {
      return reply.status(401).send({ error: "Invalid token" });
    }
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie("infraena_token", { path: "/" });
    return { success: true };
  });
}
