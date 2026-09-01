import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#060a10", card: "#0d1520", deep: "#0a0a0f", panel: "#13131a" },
        gold: { DEFAULT: "#c9952a", bright: "#f5a623", dark: "#b8821f" },
        cyan: { accent: "#38c4e8" },
        border: { DEFAULT: "#1a2a3a", muted: "#1e1e2e" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        gold: "0 0 40px rgba(201, 149, 42, 0.15)",
        cyan: "0 0 30px rgba(56, 196, 232, 0.12)",
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(201,149,42,0.18), transparent), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(56,196,232,0.08), transparent)",
      },
    },
  },
  plugins: [],
};
export default config;
