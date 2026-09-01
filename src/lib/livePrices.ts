/**
 * Live USD prices for major markets + BDAG.
 * BDAG: CoinGecko → LBank → P2B → CoinPaprika
 * Majors: CoinGecko simple/price, with Coinbase spot fallbacks for ETH/BTC
 * Stables: fixed $1 for buy math (USDT / USDC / BDUSD)
 */

export type LivePricesResponse = {
  bdagUsd: number | null;
  usdtUsd: number;
  usdcUsd: number;
  bdusdUsd: number;
  ethUsd: number | null;
  btcUsd: number | null;
  solUsd: number | null;
  bnbUsd: number | null;
  /** Primary BDAG source label */
  source: string | null;
  /** Map of asset → source label */
  sources: Record<string, string>;
  updatedAt: number;
  error?: string;
  /** Env fallback — display only, never for Buy math */
  staleEstimateUsd?: number | null;
};

export type PriceQuote = { price: number; source: string };

const FETCH_TIMEOUT_MS = 8_000;

/** Stablecoins always $1 for OLC buy math. */
export const STABLE_USD = 1 as const;

function envStaleBdagEstimate(): number | null {
  const raw = process.env.NEXT_PUBLIC_BDAG_USD_PRICE?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** CoinGecko free API — BDAG id is `blockdag` when listed. */
export async function fetchBdagFromCoinGecko(): Promise<PriceQuote | null> {
  try {
    const data = (await fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=blockdag&vs_currencies=usd"
    )) as { blockdag?: { usd?: number } };
    const price = asPositiveNumber(data?.blockdag?.usd);
    if (!price) return null;
    return { price, source: "CoinGecko" };
  } catch {
    return null;
  }
}

/** LBank public ticker BDAG/USDT. */
export async function fetchBdagFromLBank(): Promise<PriceQuote | null> {
  try {
    const data = (await fetchJson(
      "https://api.lbank.info/v2/ticker/24hr.do?symbol=bdag_usdt"
    )) as {
      error_code?: number;
      data?: Array<{ ticker?: { latest?: string } }>;
    };
    const latest = data?.data?.[0]?.ticker?.latest;
    const price = asPositiveNumber(latest);
    if (!price) return null;
    return { price, source: "LBank" };
  } catch {
    return null;
  }
}

/** P2B public ticker BDAG_USDT. */
export async function fetchBdagFromP2B(): Promise<PriceQuote | null> {
  try {
    const data = (await fetchJson(
      "https://api.p2pb2b.com/api/v2/public/ticker?market=BDAG_USDT"
    )) as { success?: boolean; result?: { last?: string } };
    const price = asPositiveNumber(data?.result?.last);
    if (!price) return null;
    return { price, source: "P2B" };
  } catch {
    return null;
  }
}

/** CoinPaprika public ticker. */
export async function fetchBdagFromCoinPaprika(): Promise<PriceQuote | null> {
  try {
    const data = (await fetchJson(
      "https://api.coinpaprika.com/v1/tickers/bdag-blockdag"
    )) as { quotes?: { USD?: { price?: number } } };
    const price = asPositiveNumber(data?.quotes?.USD?.price);
    if (!price) return null;
    return { price, source: "CoinPaprika" };
  } catch {
    return null;
  }
}

export async function fetchLiveBdagUsd(): Promise<PriceQuote | null> {
  for (const fn of [
    fetchBdagFromCoinGecko,
    fetchBdagFromLBank,
    fetchBdagFromP2B,
    fetchBdagFromCoinPaprika,
  ]) {
    const quote = await fn();
    if (quote) return quote;
  }
  return null;
}

type MajorBundle = {
  ethUsd: number | null;
  btcUsd: number | null;
  solUsd: number | null;
  bnbUsd: number | null;
  sources: Record<string, string>;
};

/** CoinGecko batch for majors. */
export async function fetchMajorsFromCoinGecko(): Promise<MajorBundle> {
  const empty: MajorBundle = {
    ethUsd: null,
    btcUsd: null,
    solUsd: null,
    bnbUsd: null,
    sources: {},
  };
  try {
    const data = (await fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd"
    )) as Record<string, { usd?: number }>;
    const out: MajorBundle = { ...empty, sources: {} };
    const btc = asPositiveNumber(data?.bitcoin?.usd);
    const eth = asPositiveNumber(data?.ethereum?.usd);
    const sol = asPositiveNumber(data?.solana?.usd);
    const bnb = asPositiveNumber(data?.binancecoin?.usd);
    if (btc) {
      out.btcUsd = btc;
      out.sources.btc = "CoinGecko";
    }
    if (eth) {
      out.ethUsd = eth;
      out.sources.eth = "CoinGecko";
    }
    if (sol) {
      out.solUsd = sol;
      out.sources.sol = "CoinGecko";
    }
    if (bnb) {
      out.bnbUsd = bnb;
      out.sources.bnb = "CoinGecko";
    }
    return out;
  } catch {
    return empty;
  }
}

async function fetchCoinbaseSpot(pair: string, label: string): Promise<PriceQuote | null> {
  try {
    const data = (await fetchJson(
      `https://api.coinbase.com/v2/prices/${pair}/spot`
    )) as { data?: { amount?: string } };
    const price = asPositiveNumber(data?.data?.amount);
    if (!price) return null;
    return { price, source: label };
  } catch {
    return null;
  }
}

export async function fetchLiveEthUsd(): Promise<PriceQuote | null> {
  return fetchCoinbaseSpot("ETH-USD", "Coinbase");
}

export async function fetchLiveBtcUsd(): Promise<PriceQuote | null> {
  return fetchCoinbaseSpot("BTC-USD", "Coinbase");
}

/** Aggregate all live prices for the API route. */
export async function fetchAllLivePrices(): Promise<LivePricesResponse> {
  const now = Date.now();
  const staleEstimateUsd = envStaleBdagEstimate();
  const sources: Record<string, string> = {
    usdt: "peg",
    usdc: "peg",
    bdusd: "peg",
  };

  const [bdag, majors] = await Promise.all([fetchLiveBdagUsd(), fetchMajorsFromCoinGecko()]);

  let ethUsd = majors.ethUsd;
  let btcUsd = majors.btcUsd;
  Object.assign(sources, majors.sources);

  // Fill gaps with Coinbase if CoinGecko missed ETH/BTC
  if (ethUsd == null || btcUsd == null) {
    const [ethFb, btcFb] = await Promise.all([
      ethUsd == null ? fetchLiveEthUsd() : Promise.resolve(null),
      btcUsd == null ? fetchLiveBtcUsd() : Promise.resolve(null),
    ]);
    if (ethFb) {
      ethUsd = ethFb.price;
      sources.eth = ethFb.source;
    }
    if (btcFb) {
      btcUsd = btcFb.price;
      sources.btc = btcFb.source;
    }
  }

  if (bdag) sources.bdag = bdag.source;

  const error = !bdag
    ? "Live BDAG/USD price unavailable from CoinGecko, LBank, P2B, and CoinPaprika"
    : undefined;

  return {
    bdagUsd: bdag?.price ?? null,
    usdtUsd: STABLE_USD,
    usdcUsd: STABLE_USD,
    bdusdUsd: STABLE_USD,
    ethUsd,
    btcUsd,
    solUsd: majors.solUsd,
    bnbUsd: majors.bnbUsd,
    source: bdag?.source ?? null,
    sources,
    updatedAt: now,
    error,
    staleEstimateUsd,
  };
}

/** Resolve live USD per unit for a pay-token id used in Buy math. */
export function usdPerUnitForPayToken(
  payTokenId: string,
  prices: Pick<
    LivePricesResponse,
    "bdagUsd" | "usdtUsd" | "usdcUsd" | "bdusdUsd" | "ethUsd"
  > | null
): { usd: number | null; live: boolean; label: string } {
  if (!prices) return { usd: null, live: false, label: "—" };
  switch (payTokenId) {
    case "BDAG":
      return prices.bdagUsd != null && prices.bdagUsd > 0
        ? { usd: prices.bdagUsd, live: true, label: "BDAG" }
        : { usd: null, live: false, label: "BDAG" };
    case "BDUSD":
      return { usd: prices.bdusdUsd, live: true, label: "BDUSD" };
    case "USDT":
      return { usd: prices.usdtUsd, live: true, label: "USDT" };
    case "USDC":
      return { usd: prices.usdcUsd, live: true, label: "USDC" };
    case "ETH":
      return prices.ethUsd != null && prices.ethUsd > 0
        ? { usd: prices.ethUsd, live: true, label: "ETH" }
        : { usd: null, live: false, label: "ETH" };
    default:
      return { usd: null, live: false, label: payTokenId };
  }
}

/**
 * Core formula:
 *   usdPaid = payTokenAmount * liveUsdPrice(payToken)
 *   olcAmount = usdPaid / liveBatchPriceUsdt
 */
export function calcOlcFromPay(params: {
  payTokenAmount: number;
  usdPerPayUnit: number;
  batchPriceUsdt: number;
}): { usdPaid: number; olcAmount: number } {
  const { payTokenAmount, usdPerPayUnit, batchPriceUsdt } = params;
  if (!(payTokenAmount > 0) || !(usdPerPayUnit > 0) || !(batchPriceUsdt > 0)) {
    return { usdPaid: 0, olcAmount: 0 };
  }
  const usdPaid = payTokenAmount * usdPerPayUnit;
  const olcAmount = usdPaid / batchPriceUsdt;
  return { usdPaid, olcAmount };
}

export function calcPayFromOlc(params: {
  olcAmount: number;
  usdPerPayUnit: number;
  batchPriceUsdt: number;
}): { usdPaid: number; payTokenAmount: number } {
  const { olcAmount, usdPerPayUnit, batchPriceUsdt } = params;
  if (!(olcAmount > 0) || !(usdPerPayUnit > 0) || !(batchPriceUsdt > 0)) {
    return { usdPaid: 0, payTokenAmount: 0 };
  }
  const usdPaid = olcAmount * batchPriceUsdt;
  const payTokenAmount = usdPaid / usdPerPayUnit;
  return { usdPaid, payTokenAmount };
}

export function buildStaleEstimate(): number | null {
  return envStaleBdagEstimate();
}

/** Format a USD price for the market strip / breakdown. */
export function formatUsdPrice(n: number | null | undefined, maxFrac = 6): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  // small caps like BDAG
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}
