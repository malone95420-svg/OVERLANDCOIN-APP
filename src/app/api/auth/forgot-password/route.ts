import { NextResponse } from "next/server";
import { emailAuthAvailable, getUserByEmail } from "@/lib/auth/userStore";
import {
  allowForgotRequest,
  newResetToken,
  saveResetToken,
} from "@/lib/auth/passwordReset";
import {
  passwordResetConfigured,
  sendPasswordResetEmail,
} from "@/lib/email/sendPasswordReset";

export const runtime = "nodejs";

const GENERIC_OK = {
  ok: true as const,
  message: "If an account exists for that email, we sent a reset link.",
};

export async function POST(req: Request) {
  try {
    const avail = emailAuthAvailable();
    if (!avail.ok) {
      return NextResponse.json({ error: avail.reason }, { status: 503 });
    }
    if (!passwordResetConfigured() && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Password reset email is temporarily unavailable. Try again shortly, or sign in with wallet." },
        { status: 503 },
      );
    }

    const body = (await req.json()) as { email?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required." }, { status: 400 });
    }

    const allowed = await allowForgotRequest(email);
    if (!allowed) {
      return NextResponse.json(GENERIC_OK);
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(GENERIC_OK);
    }

    const token = newResetToken();
    await saveResetToken(user.email, token);

    if (passwordResetConfigured()) {
      const sent = await sendPasswordResetEmail({
        to: user.email,
        token,
        name: user.name,
      });
      if (!sent.sent) {
        console.warn("[password-reset] email not sent:", sent.reason);
      }
    } else {
      console.warn(
        "[password-reset] RESEND_API_KEY unset — token created for local dev only. Reset URL: /reset-password?token=" +
          token,
      );
    }

    return NextResponse.json(GENERIC_OK);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
