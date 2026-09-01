import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, emailAuthAvailable } from "@/lib/auth/userStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const avail = emailAuthAvailable();
    if (!avail.ok) {
      return NextResponse.json({ error: avail.reason }, { status: 503 });
    }

    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = body.name ? String(body.name).trim() : undefined;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await createUser({ email, passwordHash, name });
    if ("error" in result) {
      const status = result.error.includes("already exists") ? 409 : 503;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      user: { id: result.id, email: result.email, name: result.name },
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
    google: Boolean(
      (process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID) &&
        (process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET),
    ),
  });
}
