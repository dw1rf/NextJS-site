import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "~/server/env";

const PROD_API_BASE = "https://acqapi.tinkoff.ru";
const TEST_API_BASE = "https://acqapi-test.tinkoff.ru";

function resolveApiBase() {
  const base = (env.TINKOFF_API_BASE ?? "").trim();
  if (base) return base.replace(/\/$/, "");
  const fallback = process.env.NODE_ENV === "production" ? PROD_API_BASE : TEST_API_BASE;
  return fallback;
}

function normalizePhone(input: string | null | undefined) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.startsWith("7") && digits.length === 11) {
    return `+${digits}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function normalizeRecipientId(input: string | null | undefined) {
  const phone = normalizePhone(input);
  if (!phone) return null;
  return /^\+\d{10,15}$/.test(phone) ? phone : null;
}

/**
 * SHA-256 подпись по Password-методу T-Bank.
 * Берём ВСЕ поля тела (кроме Token) + Password, сортируем ключи, конкатенируем значения.
 * Для объектов — JSON.stringify без пробелов.
 */
function makeTinkoffToken(payload: Record<string, unknown>, password: string) {
  const data: Record<string, unknown> = { ...payload, Password: password };
  delete (data as { Token?: unknown }).Token;

  const concat = Object.keys(data)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => {
      const v = data[k];
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
        return String(v);
      }
      // прочие типы (symbol/function/unknown) — игнорируем
      return "";
    })
    .join("");

  return crypto.createHash("sha256").update(concat).digest("hex");
}

function shortAttemptId() {
  return Math.random().toString(36).slice(2, 8);
}

type TinkoffInitBody = {
  TerminalKey: string;
  Amount: number; // копейки
  OrderId: string;
  Description?: string;
  SuccessURL?: string;
  FailURL?: string;
  NotificationURL?: string;
  DATA?: Record<string, unknown>;
  PaymentRecipientId?: string;
  DealId?: string;
  CreateDealWithType?: string;
  LevelOfConfidence?: "low" | "moderate" | "high";
};

type InitRequestPayload = {
  orderId: string;
  amountKopeks: number;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
};

export async function POST(req: Request) {
  try {
    const terminalKey = String(env.TINKOFF_TERMINAL_KEY ?? "").trim();
    const terminalPassword = String(env.TINKOFF_TERMINAL_PASSWORD ?? "")
      .replace(/\r|\n/g, "")
      .trim();

    if (!terminalKey || !terminalPassword) {
      return NextResponse.json(
        { ok: false, error: "Payments not configured (TerminalKey/Password missing)" },
        { status: 500 },
      );
    }

    const {
      orderId,
      amountKopeks,
      description,
      contactEmail,
      contactPhone,
    } = (await req.json()) as InitRequestPayload;

    if (!orderId || !Number.isFinite(amountKopeks) || amountKopeks < 1) {
      return NextResponse.json({ ok: false, error: "Bad input" }, { status: 400 });
    }

    const paymentRecipientId = normalizeRecipientId(env.TINKOFF_PAYMENT_RECIPIENT_ID ?? "");
    if (!paymentRecipientId) {
      return NextResponse.json(
        { ok: false, error: "PaymentRecipientId is required on server env" },
        { status: 500 },
      );
    }

    const dealId = (env.TINKOFF_DEAL_ID ?? "").toString().trim() || undefined;
    const createDealWithType = dealId ? undefined : (env.TINKOFF_CREATE_DEAL_TYPE ?? "").trim() || undefined;

    const levelRaw = (env.TINKOFF_LEVEL_OF_CONFIDENCE ?? "").trim().toLowerCase();
    let levelOfConfidence: "low" | "moderate" | "high" | undefined;
    if (levelRaw === "low" || levelRaw === "moderate" || levelRaw === "high") {
      levelOfConfidence = levelRaw;
    }

    const contactEmailClean = (contactEmail ?? "").trim() || undefined;
    const contactPhoneClean = normalizePhone(contactPhone ?? "");

    // Уникализируем OrderId, чтобы не ловить «Заказ уже существует»
    const attempt = shortAttemptId();
    let payOrderId = `${orderId}-${attempt}`;
    if (payOrderId.length > 40) payOrderId = payOrderId.slice(-40);

    // Минимально достаточное тело — это работает надёжно в демо
    const bodyBase: TinkoffInitBody = {
      TerminalKey: terminalKey,
      Amount: Math.trunc(amountKopeks), // копейки, целое число
      OrderId: payOrderId,
      Description: (description ?? "Оплата заказа").slice(0, 140),
    };

    bodyBase.PaymentRecipientId = paymentRecipientId;
    if (dealId) bodyBase.DealId = dealId;
    if (!dealId && createDealWithType) bodyBase.CreateDealWithType = createDealWithType;
    if (levelOfConfidence) bodyBase.LevelOfConfidence = levelOfConfidence;

    const dataPayload: Record<string, string> = {};
    if (contactEmailClean) dataPayload.Email = contactEmailClean;
    if (contactPhoneClean) dataPayload.Phone = contactPhoneClean;

    /**
     * УДОБСТВА (включаются флагом).
     * В проде можно включить переменной:
     *   TINKOFF_SEND_URLS="true"
     */
    const sendUrls = (env.TINKOFF_SEND_URLS ?? "").toLowerCase() === "true";

    if (sendUrls) {
      const base =
        env.AUTH_URL ??
        env.NEXTAUTH_URL ??
        (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");

      const successUrl = env.PAYMENTS_SUCCESS_URL ?? (base ? `${base}/orders/success` : "");
      const failUrl = env.PAYMENTS_FAIL_URL ?? (base ? `${base}/orders/fail` : "");
      const notificationUrl = base ? `${base}/api/payments/tinkoff/callback` : "";

      if (successUrl) bodyBase.SuccessURL = successUrl;
      if (failUrl) bodyBase.FailURL = failUrl;
      if (notificationUrl) bodyBase.NotificationURL = notificationUrl;
      bodyBase.DATA = { ...(bodyBase.DATA ?? {}), baseOrderId: orderId };
    }

    if (Object.keys(dataPayload).length > 0) {
      bodyBase.DATA = { ...(bodyBase.DATA ?? {}), ...dataPayload };
    }

    // Подписываем ровно то, что отправим
    const Token = makeTinkoffToken(bodyBase, terminalPassword);
    const body = { ...bodyBase, Token };

    const apiBase = resolveApiBase();
    const resp = await fetch(`${apiBase}/v2/Init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data: unknown = await resp.json().catch(() => ({}));

    // Безопасное извлечение Success
    const success =
      typeof data === "object" && data !== null && (data as { Success?: boolean }).Success;

    if (!resp.ok || !success) {
      const d = (data ?? {}) as Record<string, unknown>;
      console.error("[tinkoff Init] fail:", {
        httpStatus: resp.status,
        apiBase,
        message: d?.Message,
        details: d?.Details,
        errorCode: d?.ErrorCode,
        sent: bodyBase,
      });

      const errText =
        (d?.Message as string | undefined) ??
        (d?.Details as string | undefined) ??
        (d?.ErrorCode as string | undefined) ??
        `Init failed (HTTP ${resp.status})`;

      return NextResponse.json({ ok: false, error: String(errText), raw: d }, { status: 500 });
    }

    const d = data as { PaymentId?: string; PaymentURL?: string };
    return NextResponse.json({
      ok: true,
      paymentId: d.PaymentId,
      paymentUrl: d.PaymentURL,
    });
  } catch (e) {
    console.error("[tinkoff Init] exception:", e);
    return NextResponse.json({ ok: false, error: "NETWORK_OR_SERVER_ERROR" }, { status: 500 });
  }
}
