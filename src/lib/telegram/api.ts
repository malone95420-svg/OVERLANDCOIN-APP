import { CLEAN_MINI_APP_MAP_URL, telegramBotToken } from "./config";
import type { ReplyMarkup } from "./types";

type TelegramApiResult = {
  ok: boolean;
  description?: string;
  result?: unknown;
};

async function telegramCall(method: string, body?: Record<string, unknown>): Promise<TelegramApiResult> {
  const token = telegramBotToken();
  if (!token) {
    console.error("telegram_api_error", method, "missing_token");
    return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as TelegramApiResult;
  if (!res.ok || !data.ok) {
    console.error("telegram_api_error", method, res.status, data.description ?? "unknown");
  }
  return data;
}

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<TelegramApiResult> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4096),
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall("sendMessage", payload);
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<TelegramApiResult> {
  return telegramCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function setMyCommands(): Promise<TelegramApiResult> {
  return telegramCall("setMyCommands", {
    commands: [
      { command: "start", description: "Welcome + Mini App buttons" },
      { command: "map", description: "Open the Quest Map Mini App" },
      { command: "quests", description: "Featured / nearby quests" },
      { command: "ranger", description: "Talk to RANGER" },
      { command: "claim", description: "Claim OLC + Garage" },
    ],
  });
}

/** Menu button must use a clean HTTPS map URL (no query) for BotFather domain checks. */
export async function setChatMenuButton(): Promise<TelegramApiResult> {
  return telegramCall("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Quest Map",
      web_app: { url: CLEAN_MINI_APP_MAP_URL },
    },
  });
}
