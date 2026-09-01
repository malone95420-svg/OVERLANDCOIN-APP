import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "News",
  description: "OVERLANDCOIN news — stub until official posts publish.",
};

export default function NewsPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Updates</span>
      <h1 className="section-title mt-4">News</h1>
      <p className="section-sub">
        Official announcements will appear here. No fabricated headlines.
      </p>
      <div className="mt-10 card">
        <h2 className="text-lg font-bold text-white">Coming soon</h2>
        <p className="mt-2 text-sm text-slate-400">
          Follow this page for launch notes, quest seasons, and market updates once published by the team.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/presale" className="btn-primary">Presale</Link>
          <Link href="/roadmap" className="btn-secondary">Roadmap</Link>
          <Link href="/docs" className="btn-secondary">Docs</Link>
        </div>
      </div>
    </div>
  );
}
