import { replyRanger, RANGER_GREETING } from "@/lib/ranger";
import { answerCallbackQuery, sendMessage } from "./api";
import { PUBLIC_APP_URL, claimUrl, garageUrl, miniAppMapUrl } from "./config";
import {
  claimInlineKeyboard,
  locationReplyKeyboard,
  mapInlineKeyboard,
  rangerInlineKeyboard,
  startInlineKeyboard,
  questsInlineKeyboard,
} from "./keyboards";
import { enterRanger, exitRanger, isRanger } from "./rangerMode";
import { featuredQuests, formatQuestLine, nearestQuests } from "./quests";
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "./types";

const START_TEXT = [
  "OVERLANDCOIN — Adventure Powered. Location Rewarded.",
  "",
  "Open the Quest Map Mini App to browse waypoints, check in with GPS + photo, and claim OLC.",
  "Completions always go through the live app — this bot deep-links you in. No parallel ledger.",
  "",
  `${PUBLIC_APP_URL}`,
  "",
  "Commands: /map · /quests · /ranger · /claim",
  "Share your location anytime for nearby quests.",
  "Tip: Mini App opens most reliably in a private chat with this bot (desktop groups can block web_app).",
].join("\n");

const CLAIM_TEXT = [
  "Claim + Garage live in the app (same GPS + photo check-in and /api/rewards/claim flow).",
  "",
  `Claim: ${claimUrl()}`,
  `Garage: ${garageUrl()}`,
  "",
  "Open a quest from /quests or the Mini App, then Check in when you are on site.",
].join("\n");

function userIdOf(msg?: TelegramMessage, cb?: TelegramCallbackQuery): number | undefined {
  return cb?.from.id ?? msg?.from?.id;
}

function groupMiniAppTip(chatType?: string): string {
  if (!chatType || chatType === "private") return "";
  return "\n\nTip: On desktop, web_app buttons often fail in groups — message @OVERLANDCOIN_bot privately, tap Quest Map, or use Open in browser.";
}

async function sendStart(chatId: number, chatType?: string): Promise<void> {
  await sendMessage(chatId, START_TEXT + groupMiniAppTip(chatType), startInlineKeyboard());
}

async function sendMap(chatId: number, chatType?: string): Promise<void> {
  await sendMessage(
    chatId,
    `Quest Map Mini App:\n${miniAppMapUrl()}\n\nCheck-in and OLC claims stay in the app.${groupMiniAppTip(chatType)}`,
    mapInlineKeyboard(),
  );
}

async function sendFeatured(chatId: number, telegramUserId?: number): Promise<void> {
  const list = featuredQuests();
  const body = [
    "Featured quests — tap to open the map and check in (GPS + photo):",
    "",
    ...list.map((q) => formatQuestLine(q)),
    "",
    "Share your location for nearby quests.",
  ].join("\n");
  await sendMessage(chatId, body, questsInlineKeyboard(list, telegramUserId));
}

async function sendNearby(
  chatId: number,
  lat: number,
  lng: number,
  telegramUserId?: number,
): Promise<void> {
  const list = nearestQuests(lat, lng);
  const body = [
    "Nearest quests from your pin — open a card to check in on the live map:",
    "",
    ...list.map(({ quest, meters }) => formatQuestLine(quest, meters)),
  ].join("\n");
  await sendMessage(chatId, body, questsInlineKeyboard(list.map((x) => x.quest), telegramUserId));
}

async function sendRangerIntro(chatId: number): Promise<void> {
  await sendMessage(
    chatId,
    `${RANGER_GREETING}\n\nYou are in Ranger mode. Send a trail question, a region (Moab, Iceland…), or a chip: Weather tip · Trail conditions · Safety check · Quests I can reach.\n/start exits Ranger mode.`,
    rangerInlineKeyboard(),
  );
}

async function sendClaim(chatId: number): Promise<void> {
  await sendMessage(chatId, CLAIM_TEXT, claimInlineKeyboard());
}

async function handleCallback(cb: TelegramCallbackQuery): Promise<void> {
  const chatId = cb.message?.chat.id;
  const chatType = cb.message?.chat.type;
  const data = (cb.data ?? "").trim();
  if (!chatId) {
    await answerCallbackQuery(cb.id);
    return;
  }
  if (data === "quests") {
    exitRanger(chatId);
    await answerCallbackQuery(cb.id, "Featured quests");
    await sendFeatured(chatId, userIdOf(cb.message, cb));
    return;
  }
  if (data === "ranger") {
    enterRanger(chatId);
    await answerCallbackQuery(cb.id, "RANGER online");
    await sendRangerIntro(chatId);
    return;
  }
  if (data === "claim") {
    exitRanger(chatId);
    await answerCallbackQuery(cb.id);
    await sendClaim(chatId);
    return;
  }
  if (data === "map") {
    exitRanger(chatId);
    await answerCallbackQuery(cb.id);
    await sendMap(chatId, chatType);
    return;
  }
  await answerCallbackQuery(cb.id);
}

async function handleMessage(msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const fromId = userIdOf(msg);

  if (msg.location) {
    exitRanger(chatId);
    await sendNearby(chatId, msg.location.latitude, msg.location.longitude, fromId);
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text) return;

  const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    exitRanger(chatId);
    await sendStart(chatId, chatType);
    return;
  }
  if (cmd === "/map") {
    exitRanger(chatId);
    await sendMap(chatId, chatType);
    return;
  }
  if (cmd === "/quests") {
    exitRanger(chatId);
    await sendFeatured(chatId, fromId);
    await sendMessage(
      chatId,
      "Share a pin to rank quests by distance.",
      locationReplyKeyboard(),
    );
    return;
  }
  if (cmd === "/ranger") {
    enterRanger(chatId);
    await sendRangerIntro(chatId);
    return;
  }
  if (cmd === "/claim") {
    exitRanger(chatId);
    await sendClaim(chatId);
    return;
  }

  if (text.startsWith("/")) {
    return;
  }

  if (isRanger(chatId)) {
    const reply = replyRanger(text, { vehicle: null, tier: null });
    await sendMessage(chatId, reply, rangerInlineKeyboard());
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }
    if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error(
      "telegram_update_error",
      err instanceof Error ? err.name : "Error",
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? err.stack : undefined,
    );
  }
}
