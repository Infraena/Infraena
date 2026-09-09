import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { z } from "zod";

export const MAX_INBOUND_PAYLOAD_BYTES = 16 * 1024;

export function generateWebhookToken(): string {
  return randomBytes(32).toString("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const inboundSchema = z.object({
  event: z.string().min(1).max(64),
  version: z.string().min(1).max(64).optional(),
  environment: z.enum(["staging", "production"]).optional(),
  message: z.string().max(500).optional(),
  data: z.record(z.unknown()).optional(),
});

export type InboundWebhookBody = z.infer<typeof inboundSchema>;

export function parseInboundBody(body: unknown): InboundWebhookBody {
  if (body !== null && typeof body === "object") {
    const size = JSON.stringify(body).length;
    if (size > MAX_INBOUND_PAYLOAD_BYTES) {
      throw new Error("Payload too large");
    }
  }
  return inboundSchema.parse(body);
}
