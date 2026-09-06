export {};

declare global {
  interface TelegramWebApp {
    initData: string;
    platform?: string;
    ready: () => void;
    expand: () => void;
    setHeaderColor?: (color: string) => void;
    setBackgroundColor?: (color: string) => void;
    enableClosingConfirmation?: () => void;
    disableVerticalSwipes?: () => void;
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
