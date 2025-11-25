import { NextResponse, type NextRequest } from "next/server";
import React from "react";
import { z } from "zod";
import { issueLoginCode } from "~/server/auth/loginCode";
import { sendMail } from "~/server/email/send";
import SignInCodeEmail from "~/emails/SignInCodeEmail";

const RequestSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const headers = req.headers;
    const ip =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers.get("x-real-ip") ??
      undefined;
    const userAgent = headers.get("user-agent") ?? undefined;

    const result = await issueLoginCode(email, { ip, userAgent });
    if (!result.ok) {
      const status = result.reason === "INVALID_EMAIL" ? 400 : 429;
      return NextResponse.json({ ok: false, error: result.reason }, { status });
    }

    await sendMail({
      to: email,
      subject: "Код для входа на ЯЕсть",
      react: React.createElement(SignInCodeEmail, { code: result.code }),
    });

    return NextResponse.json({
      ok: true,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[auth:request-code] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
