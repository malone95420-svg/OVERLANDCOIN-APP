import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { verifyMessage, type Address } from "viem";
import { getUserByEmail } from "@/lib/auth/userStore";
import {
  isWalletMessageFresh,
  parseWalletSignInMessage,
} from "@/lib/auth/walletMessage";
import type { LoginMethod } from "@/lib/auth/types";

const googleId = process.env.AUTH_GOOGLE_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
const googleSecret =
  process.env.AUTH_GOOGLE_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();

function authSecret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (s) return s;
  // Build / local fallback — set AUTH_SECRET in production (Vercel).
  return "olc-dev-insecure-auth-secret-change-me";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authSecret(),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(googleId && googleSecret
      ? [
          Google({
            clientId: googleId,
            clientSecret: googleSecret,
          }),
        ]
      : []),
    Credentials({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await getUserByEmail(email);
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          accountKey: user.id,
          loginMethod: "email" as LoginMethod,
        };
      },
    }),
    Credentials({
      id: "wallet",
      name: "Wallet",
      credentials: {
        address: { label: "Address", type: "text" },
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials) {
        const address = String(credentials?.address ?? "").trim();
        const message = String(credentials?.message ?? "");
        const signature = String(credentials?.signature ?? "").trim();
        if (!address || !message || !signature) return null;
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

        const parsed = parseWalletSignInMessage(message);
        if (!parsed) return null;
        if (parsed.address.toLowerCase() !== address.toLowerCase()) return null;
        if (!isWalletMessageFresh(parsed.issuedAt)) return null;

        let valid = false;
        try {
          valid = await verifyMessage({
            address: address as Address,
            message,
            signature: signature as `0x${string}`,
          });
        } catch {
          return null;
        }
        if (!valid) return null;

        const checksummed = address;
        return {
          id: `wallet_${checksummed.toLowerCase()}`,
          name: `${checksummed.slice(0, 6)}…${checksummed.slice(-4)}`,
          email: null,
          accountKey: checksummed.toLowerCase(),
          loginMethod: "wallet" as LoginMethod,
          address: checksummed.toLowerCase(),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.accountKey = user.accountKey;
        token.loginMethod = user.loginMethod;
        token.address = user.address;
        if (user.id) token.sub = user.id;
      }
      if (account?.provider === "google" && token.sub) {
        token.loginMethod = "google";
        token.accountKey = `google_${token.sub}`;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.accountKey =
          (token.accountKey as string) ||
          (token.address as string) ||
          token.sub ||
          "";
        session.user.loginMethod = (token.loginMethod as LoginMethod) || "email";
        if (token.address) session.user.address = token.address as string;
      }
      return session;
    },
  },
});
