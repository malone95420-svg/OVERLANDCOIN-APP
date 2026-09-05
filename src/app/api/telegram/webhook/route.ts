import { NextRequest, NextResponse } from "next/server";
import {
  handleTelegramUpdate,
  telegramBotToken,
  telegramWebhookSecret,
} from "@/lib/telegram";
import type { TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySecret(req: NextRequest): boolean {
  const expected = telegramWebhookSecret();
  if (!expected) return true;
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  return got === expected;
}

export async function POST(req: NextRequest) {
  if (!telegramBotToken()) {
    return NextResponse.json({ ok: false, error: "bot_unconfigured" }, { status: 503 });
  }
  if (!verifySecret(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  await handleTelegramUpdate(update);
  return NextResponse.json({ ok: true });
}
