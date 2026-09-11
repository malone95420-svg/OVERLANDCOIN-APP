/**
 * Password-reset email via Resend HTTP API (no SDK).
 * No-ops when RESEND_API_KEY is unset — never invent keys.
 */

const RESEND_API = "https://api.resend.com/emails";
const BRANDED_FROM = "OVERLANDCOIN <onboarding@overlandcoin.tech>";

export type ResetSendResult =
  | { sent: true; id?: string }
  | { sent: false; reason: string };

function resendApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || undefined;
}

function fromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) return from;
  return BRANDED_FROM;
}

function siteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "https://overlandcoin-app-kohl.vercel.app";
  return raw.replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail(input: {
  to: string;
  token: string;
  name?: string;
}): Promise<ResetSendResult> {
  const key = resendApiKey();
  if (!key) {
    return { sent: false, reason: "RESEND_API_KEY is not set" };
  }

  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { sent: false, reason: "invalid recipient" };
  }

  const origin = siteOrigin();
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(input.token)}`;
  const name = input.name?.trim() || to.split("@")[0] || "explorer";
  const subject = "Reset your OVERLANDCOIN password";
  const text = [
    `Hi ${name},`,
    "",
    "We received a request to reset the password on your OVERLANDCOIN profile.",
    "This link expires in one hour and can be used once:",
    "",
    resetUrl,
    "",
    "If you did not ask for this, you can ignore this email — your password stays the same.",
    "",
    "The OVERLANDCOIN team",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0b1220;font-family:Georgia,Times,'Times New Roman',serif;color:#e8eef8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121a2b;border:1px solid #2a3550;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d4b36a;">OVERLANDCOIN</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;color:#fff;">Reset your password</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">Hi ${escapeHtml(name)},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">
                  Use the button below to choose a new password. The link expires in one hour and works only once.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#d4b36a;color:#1a1408;text-decoration:none;border-radius:8px;font-weight:600;">Choose a new password</a>
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#9aacbf;">If you did not request this, ignore the email — nothing changes.<br/>The OVERLANDCOIN team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject,
        html,
        text,
      }),
      signal: ac.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      return { sent: false, reason: data.message || `Resend HTTP ${res.status}` };
    }
    return { sent: true, id: data.id };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    const msg = aborted
      ? "Resend request timed out"
      : e instanceof Error
        ? e.message
        : "send failed";
    return { sent: false, reason: msg };
  } finally {
    clearTimeout(timer);
  }
}

export function passwordResetConfigured(): boolean {
  return Boolean(resendApiKey());
}
