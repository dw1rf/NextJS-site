import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // базовые
    NEXTAUTH_URL: z.string().url(),
    ADMIN_EMAIL: z.string().email().optional(),
    EMAIL_FROM: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),

    // лимиты
    MAX_ORDERS_PER_WINDOW: z.coerce.number().default(5),
    WINDOW_MINUTES: z.coerce.number().default(1),

    // база
    DATABASE_URL: z.string().min(1),

    // auth.js
    AUTH_URL: z.string().url().optional(),
    AUTH_TRUST_HOST: z.enum(["true", "false"]).default("false"),
    AUTH_SECRET: z.string().min(1),

    // SMTP (опционально)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),

    // 🔹 Яндекс.Метрика
    METRIKA_ID: z.string().optional(),
    METRIKA_ENABLED: z.enum(["true", "false"]).optional(),

    // 🔹 Платежи (T-Bank / Tinkoff)
    // используем подпись Token по паролю терминала:
    TINKOFF_TERMINAL_KEY: z.string().optional(),
    TINKOFF_TERMINAL_PASSWORD: z.string().optional(),
    TINKOFF_API_BASE: z.string().url().optional(),
    TINKOFF_PAYMENT_RECIPIENT_ID: z.string().optional(),
    TINKOFF_DEAL_ID: z.string().optional(),
    TINKOFF_CREATE_DEAL_TYPE: z.string().optional(),
    TINKOFF_LEVEL_OF_CONFIDENCE: z.enum(["low", "moderate", "high"]).optional(),
    TINKOFF_SEND_URLS: z.enum(["true", "false"]).optional(),

    // оставим для совместимости (не обязательно)
    TINKOFF_API_TOKEN: z.string().optional(),

    PAYMENTS_SUCCESS_URL: z.string().url().optional(),
    PAYMENTS_FAIL_URL: z.string().url().optional(),
  },

  client: {
    // ничего не пробрасываем на клиент
  },

  runtimeEnv: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY,

    MAX_ORDERS_PER_WINDOW: process.env.MAX_ORDERS_PER_WINDOW,
    WINDOW_MINUTES: process.env.WINDOW_MINUTES,

    DATABASE_URL: process.env.DATABASE_URL,

    AUTH_URL: process.env.AUTH_URL,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    AUTH_SECRET: process.env.AUTH_SECRET,

    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,

    // Метрика
    METRIKA_ID: process.env.METRIKA_ID,
    METRIKA_ENABLED: process.env.METRIKA_ENABLED,

    // Платежи
    TINKOFF_TERMINAL_KEY: process.env.TINKOFF_TERMINAL_KEY,
    TINKOFF_TERMINAL_PASSWORD: process.env.TINKOFF_TERMINAL_PASSWORD,
    TINKOFF_API_BASE: process.env.TINKOFF_API_BASE,
    TINKOFF_PAYMENT_RECIPIENT_ID: process.env.TINKOFF_PAYMENT_RECIPIENT_ID,
    TINKOFF_DEAL_ID: process.env.TINKOFF_DEAL_ID,
    TINKOFF_CREATE_DEAL_TYPE: process.env.TINKOFF_CREATE_DEAL_TYPE,
    TINKOFF_LEVEL_OF_CONFIDENCE: process.env.TINKOFF_LEVEL_OF_CONFIDENCE,
    TINKOFF_SEND_URLS: process.env.TINKOFF_SEND_URLS,
    TINKOFF_API_TOKEN: process.env.TINKOFF_API_TOKEN, // можно не задавать
    PAYMENTS_SUCCESS_URL: process.env.PAYMENTS_SUCCESS_URL,
    PAYMENTS_FAIL_URL: process.env.PAYMENTS_FAIL_URL,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
