import { FastifyRequest, FastifyReply } from "fastify";
import * as jose from "jose";
import { env } from "./env.js";

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

export async function verifyJWT(token: string): Promise<JwtPayload> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const token =
    request.cookies.idp_token ??
    request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return reply.status(401).send({ error: "Not authenticated" });
  }

  try {
    const payload = await verifyJWT(token);
    (request as unknown as Record<string, unknown>).user = payload;
  } catch {
    return reply.status(401).send({ error: "Invalid token" });
  }
}

export function getUser(request: FastifyRequest): JwtPayload | undefined {
  return (request as unknown as Record<string, JwtPayload>).user;
}
