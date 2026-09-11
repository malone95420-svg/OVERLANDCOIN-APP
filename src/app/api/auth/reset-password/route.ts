import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { emailAuthAvailable, updateUserPassword } from "@/lib/auth/userStore";
import { consumeResetToken } from "@/lib/auth/passwordReset";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const avail = emailAuthAvailable();
    if (!avail.ok) {
      return NextResponse.json({ error: avail.reason }, { status: 503 });
    }

    const body = (await req.json()) as { token?: string; password?: string };
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    if (!token) {
      return NextResponse.json({ error: "Reset link is missing or incomplete." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const email = await consumeResetToken(token);
    if (!email) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await updateUserPassword(email, passwordHash);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reset failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
