"use client";

import Script from "next/script";
import { useCallback } from "react";

function bootTelegramWebApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#060a10");
    tg.setBackgroundColor?.("#060a10");
  } catch {
    /* ignore */
  }
}

export function TelegramWebApp() {
  const onLoad = useCallback(() => {
    bootTelegramWebApp();
  }, []);

  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      onLoad={onLoad}
    />
  );
}
