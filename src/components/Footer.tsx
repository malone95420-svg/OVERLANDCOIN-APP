import Image from "next/image";
import Link from "next/link";
import { NAV_LINKS, SITE } from "@/lib/site";
import { TOKEN, explorerAddressUrl } from "@/lib/token";
import { CopyAddress } from "./CopyAddress";

export function Footer() {
  const socialEntries = [
    { key: "X / Twitter", href: SITE.social.twitter },
    { key: "Telegram", href: SITE.social.telegram },
    { key: "Discord", href: SITE.social.discord },
  ] as const;

  return (
    <footer className="mt-20 border-t border-border bg-bg-deep">
      <div className="container-page grid gap-10 py-12 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={32} height={32} className="rounded-full" />
            <span className="font-bold text-white">OVERLANDCOIN</span>
          </div>
          <p className="mt-3 text-sm text-slate-400">{SITE.tagline}</p>
          <p className="mt-2 text-sm text-slate-500">Move. Explore. Earn. Fuel for the Journey.</p>
          <a href={`mailto:${SITE.supportEmail}`} className="link-accent mt-4 inline-block text-sm">
            {SITE.supportEmail}
          </a>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Explore</h3>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-slate-400 hover:text-gold-bright">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Contract</h3>
          <p className="mt-3 text-xs text-slate-500">
            {TOKEN.chainName} · chainId {TOKEN.chainId}
          </p>
          <div className="mt-2">
            <CopyAddress showFull={false} />
          </div>
          <a
            href={explorerAddressUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="link-accent mt-3 inline-block text-sm"
          >
            View on Explorer
          </a>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-300">
            Treasury
          </h3>
          <div className="mt-2">
            <CopyAddress address={SITE.treasuryAddress} showFull={false} />
          </div>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-300">Social</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-500">
            {socialEntries.map((s) =>
              s.href ? (
                <li key={s.key}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="link-accent">
                    {s.key}
                  </a>
                </li>
              ) : (
                <li key={s.key}>
                  {s.key}: <span className="text-slate-600">Coming soon</span>
                </li>
              )
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} OVERLANDCOIN. Built on BlockDAG. Not financial advice.
      </div>
    </footer>
  );
}
