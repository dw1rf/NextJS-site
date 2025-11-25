// src/app/orders/actions/startPayment.ts
"use server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { revalidatePath } from "next/cache";
import { env } from "~/server/env";

type StartPaymentOk = { ok: true; paymentUrl: string; paymentId?: string };
type StartPaymentFail = { ok: false; error: string };
export type StartPaymentResult = StartPaymentOk | StartPaymentFail;

const P1017 = "P1017";
const PHONE_RE = /^\+?\d{10,15}$/;

function normalizePhone(input: string | null | undefined) {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.startsWith("7") && digits.length === 11) {
    return `+${digits}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function normalizeRecipient(input: string | null | undefined) {
  const phone = normalizePhone(input);
  if (!phone) return null;
  return PHONE_RE.test(phone) ? phone : null;
}

/** Короткий ретрай, если БД оборвала коннект (Prisma P1017) */
async function withDbRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      last = e;
      const err = e as { code?: string; meta?: { code?: string }; message?: string };
      const code = err?.code ?? err?.meta?.code;
      const msg = err?.message ?? "";
      if (code !== P1017 && !msg.includes(P1017)) break;
      try {
        await db.$connect();
      } catch {
        // ignore
      }
      await new Promise<void>((r) => setTimeout(r, 150));
    }
  }
  throw last;
}

/**
 * Старт оплаты со стороны пользователя.
 * Ждёт:
 *  - orderId: string
 *  - paymentMethod: "yookassa" | "card"   (внутренний маркер)
 */
export async function startPayment(formData: FormData): Promise<StartPaymentResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "NOT_AUTHENTICATED" };

  const userId = session.user.id;

  const orderId = (formData.get("orderId") as string | null) ?? "";
  const paymentMethod = (formData.get("paymentMethod") as string | null) ?? "";
  if (!orderId || !["yookassa", "card"].includes(paymentMethod)) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  // Проверяем, что заказ принадлежит текущему пользователю
  const order = await withDbRetry(() =>
    db.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        description: true,
        budget: true,
        user: { select: { email: true, phone: true, name: true } },
      },
    })
  ).catch((e) => {
    console.error("[startPayment] db error:", e);
    return null;
  });
  if (!order) return { ok: false, error: "ORDER_NOT_FOUND_OR_DB_ERROR" };

  const paymentRecipientId = normalizeRecipient(env.TINKOFF_PAYMENT_RECIPIENT_ID ?? "");
  if (!paymentRecipientId) {
    return { ok: false, error: "PAYMENT_RECIPIENT_NOT_CONFIGURED" };
  }

  const contactEmail = (order.user?.email ?? "").trim() || undefined;
  const contactPhone = normalizePhone(order.user?.phone ?? undefined) ?? undefined;

  // Сумма: из budget (в рублях) или дефолт 100 ₽
  const amountRub = typeof order.budget === "number" && order.budget > 0 ? order.budget : 100;
  const amountKopeks = Math.round(amountRub * 100);

  // Абсолютный базовый URL (важно в проде)
  const base =
    env.AUTH_URL ??
    env.NEXTAUTH_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!base) return { ok: false, error: "BASE_URL_NOT_CONFIGURED" };

  const url = new URL("/api/payments/tinkoff/init", base).toString();

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        amountKopeks,
        description: (order.description ?? "").slice(0, 140) || "Оплата заказа",
        contactEmail,
        contactPhone,
      }),
      cache: "no-store",
    });

    type ApiInitResp =
      | { ok: true; paymentUrl: string; paymentId?: string }
      | { ok: false; error: string };

    let data: ApiInitResp | null = null;
    try {
      data = (await r.json()) as ApiInitResp;
    } catch {
      data = null;
    }

    if (!r.ok || !data || !("ok" in data) || data.ok !== true || !("paymentUrl" in data)) {
      return {
        ok: false,
        error:
          (data && "error" in data ? data.error : undefined) ??
          `INIT_FAILED_${r.status}`,
      };
    }

    revalidatePath("/orders");

    return {
      ok: true,
      paymentUrl: String(data.paymentUrl),
      paymentId: "paymentId" in data && data.paymentId ? String(data.paymentId) : undefined,
    };
  } catch (e) {
    console.error("[startPayment] fetch error:", e);
    return { ok: false, error: "NETWORK_ERROR" };
  }
}
