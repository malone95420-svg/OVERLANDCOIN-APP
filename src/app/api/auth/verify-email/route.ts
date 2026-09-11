import { NextResponse } from "next/server";
import { consumePendingIfCodeOk, getPendingSignup } from "@/lib/auth/emailVerify";
import { createUser, emailAuthAvailable } from "@/lib/auth/userStore";
import { sendWelcomeEmail } from "@/lib/email/sendWelcome";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = String(url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ pending: false });
  }
  const pending = await getPendingSignup(email);
  return NextResponse.json({ pending: Boolean(pending) });
}

export async function POST(req: Request) {
  try {
    const avail = emailAuthAvailable();
    if (!avail.ok) {
      return NextResponse.json({ error: avail.reason }, { status: 503 });
    }

    const body = (await req.json()) as { email?: string; code?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").replace(/\s/g, "");

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required." }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
    }

    const pending = await consumePendingIfCodeOk(email, code);
    if ("error" in pending) {
      return NextResponse.json({ error: pending.error }, { status: 400 });
    }

    const result = await createUser({
      email: pending.email,
      passwordHash: pending.passwordHash,
      name: pending.name,
    });
    if ("error" in result) {
      const status = result.error.includes("already exists") ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    try {
      const welcome = await sendWelcomeEmail({ to: result.email, name: result.name });
      if (!welcome.sent) console.warn("[welcome-email] not sent:", welcome.reason);
    } catch (err) {
      console.warn("[welcome-email] soft error:", err instanceof Error ? err.message : "unknown");
    }

    return NextResponse.json({
      ok: true,
      user: { id: result.id, email: result.email, name: result.name },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
