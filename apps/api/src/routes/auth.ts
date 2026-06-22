import { FastifyInstance } from "fastify";
import { env } from "../lib/env.js";
import { prisma } from "../db/prisma.js";
import * as jose from "jose";

const JWT_EXPIRATION = "7d";

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

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    url.searchParams.set("scope", "user:email");
    url.searchParams.set(
      "redirect_uri",
      `http://localhost:${env.API_PORT}/auth/github/callback`
    );
    return reply.redirect(url.toString());
  });

  app.get("/github/callback", async (request, reply) => {
    const { code } = request.query as { code?: string };

    if (!code) {
      return reply.status(400).send({ error: "Missing code parameter" });
    }

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return reply
        .status(500)
        .send({ error: "GitHub OAuth not configured" });
    }

    try {
      const accessToken = await exchangeCodeForToken(code);
      const ghUser = await fetchGitHubUser(accessToken);

      const user = await prisma.user.upsert({
        where: { githubId: String(ghUser.id) },
        update: {
          username: ghUser.login,
          email: ghUser.email,
          avatarUrl: ghUser.avatar_url,
        },
        create: {
          githubId: String(ghUser.id),
          username: ghUser.login,
          email: ghUser.email,
          avatarUrl: ghUser.avatar_url,
          role: "member",
        },
      });

      const token = await signJWT({
        sub: user.id,
        username: user.username,
        role: user.role,
      });

      reply.setCookie("idp_token", token, {
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
      request.cookies.idp_token ??
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
    reply.clearCookie("idp_token", { path: "/" });
    return { success: true };
  });
}
