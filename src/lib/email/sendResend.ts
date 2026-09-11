/**
 * Shared Resend HTTP send. Tries EMAIL_FROM, then branded domain, then
 * Resend's onboarding sandbox if the domain is not verified.
 */

const RESEND_API = "https://api.resend.com/emails";
export const BRANDED_FROM = "OVERLANDCOIN <onboarding@overlandcoin.tech>";
export const RESEND_TEST_FROM = "OVERLANDCOIN <beth.t@example.com>";

export type ResendSendResult =
  | { sent: true; id?: string; from: string }
  | { sent: false; reason: string };

export function resendApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || undefined;
}

export function mailConfigured(): boolean {
  return Boolean(resendApiKey());
}

export function siteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "https://www.overlandcoin.tech";
  return raw.replace(/\/$/, "");
}

function fromCandidates(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [process.env.EMAIL_FROM?.trim(), BRANDED_FROM, RESEND_TEST_FROM]) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function errorLooksLikeUnverifiedFrom(message: string): boolean {
  return /domain is not verified|not verified|invalid `from`|from domain/i.test(message);
}

async function postResend(input: {
  key: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; id?: string; message: string; status: number }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: "overlanders.official@gmail.com",
      }),
      signal: ac.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    const message = data.message || data.name || `Resend HTTP ${res.status}`;
    return { ok: res.ok, id: data.id, message, status: res.status };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    const msg = aborted
      ? "Resend request timed out"
      : e instanceof Error
        ? e.message
        : "send failed";
    return { ok: false, message: msg, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<ResendSendResult> {
  const key = resendApiKey();
  if (!key) {
    return { sent: false, reason: "RESEND_API_KEY is not set" };
  }
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { sent: false, reason: "invalid recipient" };
  }

  let lastReason = "send failed";
  for (const from of fromCandidates()) {
    const result = await postResend({
      key,
      from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (result.ok) {
      if (from !== fromCandidates()[0]) {
        console.warn("[email] sent using fallback from:", from);
      }
      return { sent: true, id: result.id, from };
    }
    lastReason = `${from}: ${result.message}`;
    console.warn("[email] send failed", lastReason);
    if (!errorLooksLikeUnverifiedFrom(result.message)) {
      break;
    }
  }
  return { sent: false, reason: lastReason };
}
