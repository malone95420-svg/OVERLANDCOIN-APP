import {
  browserMapUrl,
  claimUrl,
  garageUrl,
  miniAppHomeUrl,
  miniAppMapUrl,
  questMapUrl,
} from "./config";
import type { InlineKeyboardMarkup, ReplyKeyboardMarkup } from "./types";
import type { Quest } from "@/data/quests";

/** Telegram inline button text max is 64 chars. */
function truncateButtonText(text: string, max = 64): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function startInlineKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Open Quest Map", web_app: { url: miniAppMapUrl() } }],
      [{ text: "Open in browser", url: browserMapUrl() }],
      [{ text: "Mini App Home", web_app: { url: miniAppHomeUrl() } }],
      [
        { text: "Featured Quests", callback_data: "quests" },
        { text: "Talk to Ranger", callback_data: "ranger" },
      ],
      [
        { text: "Claim", web_app: { url: claimUrl() } },
        { text: "Garage", web_app: { url: garageUrl() } },
      ],
    ],
  };
}

export function mapInlineKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Open Quest Map", web_app: { url: miniAppMapUrl() } }],
      [{ text: "Open in browser", url: browserMapUrl() }],
      [{ text: "Mini App Home", web_app: { url: miniAppHomeUrl() } }],
    ],
  };
}

export function claimInlineKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Claim OLC", web_app: { url: claimUrl() } },
        { text: "Garage", web_app: { url: garageUrl() } },
      ],
      [{ text: "Open Quest Map", web_app: { url: miniAppMapUrl() } }],
      [{ text: "Open in browser", url: browserMapUrl() }],
    ],
  };
}

export function rangerInlineKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Open Ranger in Mini App", web_app: { url: miniAppHomeUrl() } }],
      [{ text: "Quest Map", web_app: { url: miniAppMapUrl() } }],
      [{ text: "Open in browser", url: browserMapUrl() }],
    ],
  };
}

export function locationReplyKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: "Share location for nearby quests", request_location: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function questsInlineKeyboard(
  quests: Quest[],
  telegramUserId?: number,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...quests.map((q) => [
        {
          text: truncateButtonText(`${q.title} · ${q.rewardOlC} OLC`),
          web_app: { url: questMapUrl(q.id, telegramUserId) },
        },
      ]),
      [
        {
          text: "Open Quest Map",
          web_app: {
            url: telegramUserId
              ? miniAppMapUrl({ telegram_user_id: telegramUserId })
              : miniAppMapUrl(),
          },
        },
      ],
      [{ text: "Open in browser", url: browserMapUrl() }],
    ],
  };
}
