/**
 * Display name + bio for the explorer profile.
 * Scoped by accountKey when signed in; guest key otherwise.
 * Session name/email stay authoritative for identity; this is local UX only.
 */

import { scopedStorageKey } from "@/lib/auth/accountScope";

export const EXPLORER_PROFILE_KEY = "overlandcoin.explorerProfile.v1";

export type ExplorerProfile = {
  displayName: string;
  bio: string;
};

const EMPTY: ExplorerProfile = { displayName: "", bio: "" };

export function loadExplorerProfile(): ExplorerProfile {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(scopedStorageKey(EXPLORER_PROFILE_KEY));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ExplorerProfile>;
    return {
      displayName: typeof parsed.displayName === "string" ? parsed.displayName.slice(0, 48) : "",
      bio: typeof parsed.bio === "string" ? parsed.bio.slice(0, 280) : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveExplorerProfile(next: ExplorerProfile): ExplorerProfile {
  const clean: ExplorerProfile = {
    displayName: next.displayName.trim().slice(0, 48),
    bio: next.bio.trim().slice(0, 280),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(scopedStorageKey(EXPLORER_PROFILE_KEY), JSON.stringify(clean));
  }
  return clean;
}

export function explorerRank(questsCompleted: number): string {
  if (questsCompleted <= 0) return "Novice";
  if (questsCompleted < 5) return "Trailblazer";
  if (questsCompleted < 15) return "Pathfinder";
  if (questsCompleted < 30) return "Ranger";
  return "Legend";
}

export function formatOlc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function shortWallet(address?: string | null): string {
  if (!address) return "";
  const a = address.trim();
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
