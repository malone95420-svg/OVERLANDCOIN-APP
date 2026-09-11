import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { emailAuthAvailable, getUserByEmail } from "@/lib/auth/userStore";
import {
  allowCodeSend,
  getPendingSignup,
  newVerifyCode,
  savePendingSignup,
} from "@/lib/auth/emailVerify";
import { mailConfigured } from "@/lib/email/sendWelcome";
import { sendVerifyCodeEmail } from "@/lib/email/sendVerifyCode";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const avail = emailAuthAvailable();
    if (!avail.ok) {
      return NextResponse.json({ error: avail.reason }, { status: 503 });
    }
    if (!mailConfigured() && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Email verification is temporarily unavailable. Use wallet sign-in, or try again shortly." },
        { status: 503 },
      );
    }

    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
      resend?: boolean;
    };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = body.name ? String(body.name).trim() : undefined;
    const resend = Boolean(body.resend);

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required." }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    let passwordHash: string;
    let pendingName = name;
    if (resend) {
      const pending = await getPendingSignup(email);
      if (!pending) {
        return NextResponse.json(
          { error: "That code expired. Create your profile again." },
          { status: 400 },
        );
      }
      passwordHash = pending.passwordHash;
      pendingName = pending.name;
    } else {
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters." },
          { status: 400 },
        );
      }
      passwordHash = await bcrypt.hash(password, 10);
    }

    const allowed = await allowCodeSend(email);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many codes sent. Wait a bit and try again." },
        { status: 429 },
      );
    }

    const code = newVerifyCode();
    await savePendingSignup({ email, passwordHash, name: pendingName, code });
    const sent = await sendVerifyCodeEmail({ to: email, code, name: pendingName });
    if (!sent.sent) {
      console.warn("[verify-email] not sent:", sent.reason);
      return NextResponse.json(
        { error: "We couldn't send the verification code. Try again in a minute." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      needsVerification: true,
      email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Registration failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const avail = emailAuthAvailable();
  return NextResponse.json({
    emailAuth: avail.ok,
    reason: avail.ok ? null : avail.reason,
    mailConfigured: mailConfigured(),
    google: Boolean(
      (process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID) &&
        (process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET),
    ),
  });
}
