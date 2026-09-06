/**
 * Telegram Mini App + bot constants.
 * Public links always go to the live app so check-in / claim stay authoritative.
 *
 * BotFather Web App domain must be: overlandcoin.tech
 * Menu / web_app URLs use the www HTTPS origin (apex 308s to www).
 */
export const PUBLIC_APP_URL = "https://www.overlandcoin.tech";

export const MINI_APP_MAP_PATH = "/map";
export const MINI_APP_HOME_PATH = "/tg";

/** Clean map URL for menu button + primary web_app (no query — BotFather-friendly). */
export const CLEAN_MINI_APP_MAP_URL = `${PUBLIC_APP_URL}${MINI_APP_MAP_PATH}`;
export const CLEAN_MINI_APP_HOME_URL = `${PUBLIC_APP_URL}${MINI_APP_HOME_PATH}`;

export function telegramBotToken(): string | undefined {
  const raw = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!raw) return undefined;
  return raw.replace(/\s+/g, "");
}

export function telegramWebhookSecret(): string | undefined {
  const raw = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return raw || undefined;
}

/**
 * Build an app URL. Does NOT auto-append utm (noisy query breaks some Mini App
 * menu / BotFather checks). Pass utm explicitly when linking for browser opens.
 */
export function appUrl(
  path: string,
  extra?: Record<string, string | number | undefined | null>,
): string {
  const base = path.startsWith("http")
    ? path
    : `${PUBLIC_APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(base);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function miniAppMapUrl(
  extra?: Record<string, string | number | undefined | null>,
): string {
  if (!extra || Object.values(extra).every((v) => v === undefined || v === null || v === "")) {
    return CLEAN_MINI_APP_MAP_URL;
  }
  return appUrl(MINI_APP_MAP_PATH, extra);
}

export function miniAppHomeUrl(
  extra?: Record<string, string | number | undefined | null>,
): string {
  if (!extra || Object.values(extra).every((v) => v === undefined || v === null || v === "")) {
    return CLEAN_MINI_APP_HOME_URL;
  }
  return appUrl(MINI_APP_HOME_PATH, extra);
}

/** Plain HTTPS link for desktop / group fallback (browser, not web_app). */
export function browserMapUrl(): string {
  return appUrl(MINI_APP_MAP_PATH, { utm_source: "telegram_browser" });
}

export function questMapUrl(questId: string, telegramUserId?: number): string {
  return miniAppMapUrl({
    quest: questId,
    telegram_user_id: telegramUserId,
  });
}

export function claimUrl(): string {
  return appUrl("/claim");
}

export function garageUrl(): string {
  return appUrl("/garage");
}

export function rangerUrl(): string {
  return appUrl("/ranger");
}

export const WEBHOOK_PATH = "/api/telegram/webhook";
export const WEBHOOK_URL = `${PUBLIC_APP_URL}${WEBHOOK_PATH}`;
