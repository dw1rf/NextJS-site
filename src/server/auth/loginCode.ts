import crypto from "node:crypto";
import { db } from "~/server/db";
import { env } from "~/server/env";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 минут
const MIN_INTERVAL_MS = 30 * 1000; // не чаще одного письма в 30 секунд
const WINDOW_MS = 60 * 60 * 1000; // окно для подсчета писем
const MAX_CODES_PER_WINDOW = 5;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(`${code}:${env.AUTH_SECRET}`).digest("hex");
}

function generateCode(length = 6) {
  let result = "";
  while (result.length < length) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result.slice(0, length);
}

async function cleanupExpired() {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await db.loginCode.deleteMany({ where: { expiresAt: { lt: cutoff } } }).catch(() => undefined);
}

export type IssueCodeResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: "INVALID_EMAIL" | "TOO_SOON" | "RATE_LIMIT" };

export async function issueLoginCode(
  email: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<IssueCodeResult> {
  const normalized = normalizeEmail(email ?? "");
  if (!normalized) return { ok: false, reason: "INVALID_EMAIL" };

  const now = new Date();
  const last = await db.loginCode.findFirst({
    where: { email: normalized },
    orderBy: { createdAt: "desc" },
  });

  if (last && now.getTime() - last.createdAt.getTime() < MIN_INTERVAL_MS) {
    return { ok: false, reason: "TOO_SOON" };
  }

  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const count = await db.loginCode.count({
    where: { email: normalized, createdAt: { gte: windowStart } },
  });
  if (count >= MAX_CODES_PER_WINDOW) {
    return { ok: false, reason: "RATE_LIMIT" };
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await db.loginCode.create({
    data: {
      email: normalized,
      codeHash: hashCode(code),
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  void cleanupExpired();

  return { ok: true, code, expiresAt };
}

export type ConsumeCodeResult =
  | { ok: true }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "LOCKED" };

export async function consumeLoginCode(email: string, code: string): Promise<ConsumeCodeResult> {
  const normalized = normalizeEmail(email ?? "");
  const trimmedCode = (code ?? "").trim();
  if (!normalized || trimmedCode.length === 0) {
    return { ok: false, reason: "INVALID" };
  }

  const hash = hashCode(trimmedCode);
  const now = new Date();
  const candidates = await db.loginCode.findMany({
    where: { email: normalized, expiresAt: { gte: now }, consumed: false },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (!candidates.length) {
    return { ok: false, reason: "EXPIRED" };
  }

  const match = candidates.find((c) => c.codeHash === hash);
  if (match) {
    await db.loginCode.update({
      where: { id: match.id },
      data: { consumed: true, consumedAt: now },
    });
    return { ok: true };
  }

  const latest = candidates[0]!;
  const attempts = latest.attempts + 1;
  const locked = attempts >= MAX_ATTEMPTS;
  await db.loginCode
    .update({
      where: { id: latest.id },
      data: {
        attempts: { increment: 1 },
        ...(locked ? { consumed: true, consumedAt: now } : {}),
      },
    })
    .catch(() => undefined);

  return { ok: false, reason: locked ? "LOCKED" : "INVALID" };
}
