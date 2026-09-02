/**
 * Multi-injected wallet providers for BlockDAG 1404.
 * Prefer named globals (okxwallet, trustwallet, …) over guessing window.ethereum alone.
 * Do NOT invent providers — detection only.
 */

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | unknown }) => Promise<unknown>;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBitKeep?: boolean;
  isOkxWallet?: boolean;
  providers?: Eip1193Provider[];
};

export type InjectedWalletId =
  | "okx"
  | "trust"
  | "rabby"
  | "coinbase"
  | "bitget"
  | "injected";

export type InjectedWalletDef = {
  id: InjectedWalletId;
  name: string;
  /** Resolve provider from a window-like object (wagmi target.provider). */
  provider: (windowObj: Window) => Eip1193Provider | undefined;
};

type Win = Window & {
  ethereum?: Eip1193Provider;
  okxwallet?: Eip1193Provider & { ethereum?: Eip1193Provider };
  trustwallet?: Eip1193Provider;
  rabby?: Eip1193Provider;
  coinbaseWalletExtension?: Eip1193Provider;
  bitkeep?: { ethereum?: Eip1193Provider };
  bitget?: Eip1193Provider;
};

function asWin(windowObj: Window): Win {
  return windowObj as Win;
}

function fromEthereumFlag(
  windowObj: Window,
  flag: keyof Eip1193Provider,
): Eip1193Provider | undefined {
  const eth = asWin(windowObj).ethereum;
  if (!eth) return undefined;
  if (eth[flag]) return eth;
  const multi = eth.providers;
  if (Array.isArray(multi)) {
    return multi.find((p) => Boolean(p?.[flag]));
  }
  return undefined;
}

export const INJECTED_WALLET_DEFS: InjectedWalletDef[] = [
  {
    id: "okx",
    name: "OKX Wallet",
    provider: (w) => {
      const okx = asWin(w).okxwallet;
      return (okx?.ethereum ?? okx) as Eip1193Provider | undefined;
    },
  },
  {
    id: "trust",
    name: "Trust Wallet",
    provider: (w) =>
      asWin(w).trustwallet ?? fromEthereumFlag(w, "isTrust"),
  },
  {
    id: "rabby",
    name: "Rabby",
    provider: (w) => asWin(w).rabby ?? fromEthereumFlag(w, "isRabby"),
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    provider: (w) =>
      asWin(w).coinbaseWalletExtension ?? fromEthereumFlag(w, "isCoinbaseWallet"),
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    provider: (w) => {
      const bk = asWin(w).bitkeep?.ethereum ?? asWin(w).bitget;
      return bk ?? fromEthereumFlag(w, "isBitKeep");
    },
  },
  {
    id: "injected",
    name: "Browser wallet",
    provider: (w) => {
      const eth = asWin(w).ethereum;
      return eth?.request ? eth : undefined;
    },
  },
];

export function resolveInjectedProvider(
  id: InjectedWalletId,
  windowObj: Window = typeof window !== "undefined" ? window : (undefined as unknown as Window),
): Eip1193Provider | undefined {
  if (!windowObj) return undefined;
  const def = INJECTED_WALLET_DEFS.find((d) => d.id === id);
  const p = def?.provider(windowObj);
  return p?.request ? p : undefined;
}

/** Prefer named wallets, then generic ethereum — for Add/Switch when connector unknown. */
export function getAnyInjectedProvider(
  windowObj: Window = typeof window !== "undefined" ? window : (undefined as unknown as Window),
): Eip1193Provider | undefined {
  if (!windowObj) return undefined;
  for (const def of INJECTED_WALLET_DEFS) {
    if (def.id === "injected") continue;
    const p = def.provider(windowObj);
    if (p?.request) return p;
  }
  return resolveInjectedProvider("injected", windowObj);
}

export function isInjectedWalletPresent(id: InjectedWalletId): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(resolveInjectedProvider(id, window));
}

export function detectedInjectedWalletIds(): InjectedWalletId[] {
  if (typeof window === "undefined") return [];
  const ids: InjectedWalletId[] = [];
  for (const def of INJECTED_WALLET_DEFS) {
    if (def.id === "injected") {
      if (asWin(window).ethereum?.request) ids.push("injected");
      continue;
    }
    if (resolveInjectedProvider(def.id, window)) ids.push(def.id);
  }
  return ids;
}

export function connectorDisplayName(name: string, id: string): string {
  if (id === "okx" || /okx/i.test(name)) return "OKX Wallet";
  if (id === "trust" || /trust/i.test(name)) return "Trust Wallet";
  if (id === "rabby" || /rabby/i.test(name)) return "Rabby";
  if (id === "coinbase" || /coinbase/i.test(name)) return "Coinbase Wallet";
  if (id === "bitget" || /bitget|bitkeep/i.test(name)) return "Bitget Wallet";
  if (id === "walletConnect" || /walletconnect/i.test(name)) return "WalletConnect";
  if (id === "injected" || name === "Injected" || name === "MetaMask") return "Browser wallet";
  return name;
}
