import { lookup as dnsLookup } from "node:dns/promises";

export const MAX_OUTBOUND_URL_LENGTH = 500;

export type OutboundUrlCheck = { ok: boolean; reason?: string };

export type LookupFn = (
  hostname: string,
  options: { all: true }
) => Promise<{ address: string; family: number }[]>;

const BLOCKED_HOSTNAMES = new Set(["metadata.google.internal", "metadata", "localhost"]);

function normalizeIp(ip: string): string {
  const lower = ip.trim().toLowerCase();
  if (lower.startsWith("[") && lower.endsWith("]")) return lower.slice(1, -1);
  return lower;
}

function parseIpv6Bytes(value: string): number[] | null {
  let ip = value;
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    const v4 = ip.slice(lastColon + 1).split(".");
    if (v4.length !== 4) return null;
    const octets = v4.map(Number);
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    ip = `${ip.slice(0, lastColon + 1)}${(((octets[0] << 8) | octets[1]).toString(16))}:${(((octets[2] << 8) | octets[3]).toString(16))}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    const n = parseInt(group || "0", 16);
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function parseBytes(ip: string): { v4?: number[]; v6?: number[] } {
  const value = normalizeIp(ip);
  if (isIpv4(value)) return { v4: value.split(".").map(Number) };
  const bytes = parseIpv6Bytes(value);
  if (!bytes) return {};
  const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (mapped) return { v4: bytes.slice(12) };
  return { v6: bytes };
}

export function isReservedAddress(ip: string): boolean {
  const { v4, v6 } = parseBytes(ip);
  if (v4) {
    const [a, b] = v4;
    return a === 0 || a === 127 || (a === 169 && b === 254);
  }
  if (v6) {
    const allZeroExceptLast = v6.slice(0, 15).every((b) => b === 0) && v6[15] <= 1;
    if (allZeroExceptLast) return true;
    if (v6[0] === 0xfe && (v6[1] & 0xc0) === 0x80) return true;
    if (v6[0] === 0xfd && v6[1] === 0x00 && v6[2] === 0x0e && v6[3] === 0xc2) return true;
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const { v4, v6 } = parseBytes(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (v6) {
    return (v6[0] & 0xfe) === 0xfc;
  }
  return false;
}

export function validateOutboundUrlSync(
  url: string,
  maxLength = MAX_OUTBOUND_URL_LENGTH
): OutboundUrlCheck {
  if (!url || url.length > maxLength) return { ok: false, reason: "URL too long" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Credentials in URL are not allowed" };
  }
  if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    return { ok: false, reason: "Blocked host" };
  }
  return { ok: true };
}

export function redactUrl(url: string): string {
  return url.replace(/(\/api\/webhooks\/in\/)[^/?]+/i, "$1[redacted]");
}

export async function validateOutboundUrl(
  url: string,
  options: { allowPrivate: boolean },
  lookupFn: LookupFn = dnsLookup
): Promise<OutboundUrlCheck> {
  const sync = validateOutboundUrlSync(url);
  if (!sync.ok) return sync;

  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string }[];
  try {
    addresses = await lookupFn(hostname, { all: true });
  } catch {
    return { ok: false, reason: "Host could not be resolved" };
  }
  if (addresses.length === 0) return { ok: false, reason: "Host could not be resolved" };

  for (const { address } of addresses) {
    if (isReservedAddress(address)) return { ok: false, reason: `Blocked address ${address}` };
    if (!options.allowPrivate && isPrivateAddress(address)) {
      return { ok: false, reason: `Private address not allowed` };
    }
  }
  return { ok: true };
}
