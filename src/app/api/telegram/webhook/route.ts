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
  if (!expected) return false;
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

  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    console.error(
      "telegram_webhook_error",
      err instanceof Error ? err.name : "Error",
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? err.stack : undefined,
    );
    // Always 200-shaped ok so Telegram does not retry-storm; handler also swallows.
    return NextResponse.json({ ok: true, handled: false });
  }
  return NextResponse.json({ ok: true });
}
