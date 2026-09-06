"use client";

import { useEffect } from "react";

function bootTelegramWebApp(): boolean {
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#060a10");
    tg.setBackgroundColor?.("#060a10");
    tg.disableVerticalSwipes?.();
  } catch {
    /* ignore */
  }
  return true;
}

/** Boots Telegram.WebApp after the beforeInteractive script in root layout. */
export function TelegramWebApp() {
  useEffect(() => {
    if (bootTelegramWebApp()) return;
    let tries = 0;
    const iv = window.setInterval(() => {
      tries += 1;
      if (bootTelegramWebApp() || tries >= 40) {
        window.clearInterval(iv);
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, []);

  return null;
}
