import type { NextAuthConfig } from "next-auth";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "~/server/db";
import { env } from "~/server/env";
import { consumeLoginCode } from "./loginCode";

const baseAuthUrl = env.NEXTAUTH_URL || env.AUTH_URL;
if (!baseAuthUrl) {
  throw new Error("Configure NEXTAUTH_URL or AUTH_URL (e.g. https://www.yayest.site)");
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  trustHost: env.AUTH_TRUST_HOST === "true",
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt" },
  debug: process.env.NODE_ENV === "development",

  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify-request",
    error: "/auth/error",
  },

  providers: [
    CredentialsProvider({
      id: "code",
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const rawEmail = credentials?.email;
        const rawCode = credentials?.code;
        if (typeof rawEmail !== "string" || typeof rawCode !== "string") return null;
        const email = rawEmail.trim().toLowerCase();
        const code = rawCode.trim();
        if (!email || !code) return null;

        const outcome = await consumeLoginCode(email, code);
        if (!outcome.ok) return null;

        const user = await db.user.upsert({
          where: { email },
          update: {},
          create: { email, emailVerified: new Date() },
        });
        return user;
      },
    }),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);
        if (u.origin === baseUrl && u.pathname.startsWith("/")) return u.toString();
      } catch {}
      return baseUrl;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) (session.user as { id?: string }).id = token.sub ?? undefined;
      return session;
    },
  },
};
