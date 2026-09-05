"use client";

import { useEffect, useState } from "react";

export function useTelegramWebApp(): boolean {
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    function detect() {
      const tg = window.Telegram?.WebApp;
      if (!tg) return false;
      if (tg.initData) return true;
      if (tg.platform && tg.platform !== "unknown") return true;
      return false;
    }
    if (detect()) {
      setIsTelegram(true);
      return;
    }
    const iv = window.setInterval(() => {
      if (detect()) {
        setIsTelegram(true);
        window.clearInterval(iv);
      }
    }, 250);
    const stop = window.setTimeout(() => window.clearInterval(iv), 4000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(stop);
    };
  }, []);

  return isTelegram;
}
