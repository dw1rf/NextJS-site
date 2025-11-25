"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type Phase = "email" | "code";
const COOLDOWN_SECONDS = 60;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function requestErrorMessage(code?: string | null) {
  switch (code) {
    case "TOO_SOON":
      return "Code already sent. Check your inbox or retry in a moment.";
    case "RATE_LIMIT":
      return "Too many attempts. Please try again later.";
    default:
      return "We could not send the code. Please retry.";
  }
}

export default function SignInForm({
  _initialCsrfToken = "",
  callbackUrl = "/orders",
}: {
  _initialCsrfToken?: string;
  callbackUrl?: string;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("email");
  const [submitting, setSubmitting] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [orderEmails, setOrderEmails] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const lockRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const requestCode = useCallback(async () => {
    if (lockRef.current || submitting) return;
    const value = normalizeEmail(email);
    if (!value || !policy) return;

    lockRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      await fetch("/api/consents/stash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: value,
          consent: { policy, orderEmails, marketing },
        }),
      }).catch(() => undefined);

      const resp = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });

      const data = (await resp.json().catch(() => null)) as
        | { ok: true; expiresAt?: string }
        | { ok: false; error?: string }
        | null;

      if (!resp.ok || !data || !("ok" in data) || !data.ok) {
        setError(requestErrorMessage(data && "error" in data ? data.error : undefined));
        return;
      }

      setPhase("code");
      setCode("");
      setExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
      setCooldown(COOLDOWN_SECONDS);
      setInfo(`We sent a code to ${value}. Check your inbox.`);
    } catch {
      setError("Failed to send the code. Please try again.");
    } finally {
      setSubmitting(false);
      lockRef.current = false;
    }
  }, [email, policy, orderEmails, marketing, submitting]);

  const verifyCode = useCallback(async () => {
    if (lockRef.current || submitting) return;

    const value = normalizeEmail(email);
    if (!value || !code.trim()) return;

    lockRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const result = await signIn("code", {
        email: value,
        code: code.trim(),
        callbackUrl,
        redirect: false,
      });

      if (!result) {
        setError("Sign-in failed. Please try again.");
        return;
      }

      if (result.error) {
        setError("The code is invalid or expired. Request a new one.");
        return;
      }

      if (result.url) {
        window.location.href = result.url;
        return;
      }

      window.location.href = callbackUrl;
    } catch {
      setError("Could not verify the code. Try again.");
    } finally {
      setSubmitting(false);
      lockRef.current = false;
    }
  }, [email, code, callbackUrl, submitting]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (phase === "email") {
        void requestCode();
      } else {
        void verifyCode();
      }
    },
    [phase, requestCode, verifyCode],
  );

  const changeEmail = () => {
    if (submitting) return;
    setPhase("email");
    setCode("");
    setInfo(null);
    setError(null);
  };

  const resend = () => {
    if (!submitting && cooldown === 0) void requestCode();
  };

  return (
    <form className="grid gap-4" onSubmit={onSubmit} aria-busy={submitting}>
      <div className="space-y-3 px-3">
        <Label className="block text-sm font-semibold text-slate-600">Email</Label>
        <Input
          type="email"
          name="email"
          placeholder="you@mail.ru"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting || phase === "code"}
        />
      </div>

      {phase === "email" ? (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={policy}
              onChange={(e) => setPolicy(e.target.checked)}
              required
              disabled={submitting}
            />
            <span>
              I agree with the {" "}
              <a href="/policy/terms" className="text-sky-700 underline" target="_blank">
                Terms of Service
              </a>{" "}
              and {" "}
              <a href="/policy/privacy" className="text-sky-700 underline" target="_blank">
                Privacy Policy
              </a>
              .
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={orderEmails}
              onChange={(e) => setOrderEmails(e.target.checked)}
              disabled={submitting}
            />
            <span>Receive order updates (new order, status changes, messages).</span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              disabled={submitting}
            />
            <span>Receive service news (rare, important updates only).</span>
          </label>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg bg-blue-50/70 p-3 text-sm">
          <div className="space-y-3">
            <Label className="block text-sm font-semibold text-slate-600">Verification code</Label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              placeholder="000000"
              value={code}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(cleaned);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData?.getData("text") ?? "";
                const cleaned = pasted.replace(/\D/g, "").slice(0, 6);
                setCode(cleaned);
              }}
              disabled={submitting}
              autoFocus
            />
            <p className="text-xs text-slate-500">Enter the 6-digit code from the email.</p>
          </div>
          <p className="text-sm text-slate-600">
            We sent the code to <span className="font-semibold">{normalizeEmail(email)}</span>. {" "}
            {expiresAt ? `Valid until ${expiresAt.toLocaleTimeString("ru-RU")}.` : "Code is valid for 10 minutes."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resend}
              disabled={submitting || cooldown > 0}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={changeEmail} disabled={submitting}>
              Change email
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {info && <p className="text-sm text-slate-500">{info}</p>}

      <Button
        type="submit"
        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-70 disabled:cursor-not-allowed"
        disabled={submitting || !email || (phase === "email" && !policy) || (phase === "code" && !code.trim())}
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            {phase === "email" ? "Sending code..." : "Checking code..."}
          </span>
        ) : phase === "email" ? (
          "Get code"
        ) : (
          "Sign in"
        )}
      </Button>

      {submitting && (
        <p className="text-center text-xs text-slate-500">
          This might take a few seconds. If you do not see the email, check the spam folder or request another code.
        </p>
      )}
    </form>
  );
}
