import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/AdminOverview";

export const metadata: Metadata = {
  title: "Admin · Overview",
  description:
    "On-chain OLC balances of the presale and quest reward wallets, plus totals sold and claimed.",
  robots: { index: false, follow: false },
};

export default function AdminOverviewPage() {
  return (
    <div className="page-shell">
      <span className="badge">Admin</span>
      <h1 className="section-title mt-4">Balances &amp; sold</h1>
      <p className="section-sub">
        On-chain OLC balances of the presale and quest reward wallets, plus totals sold and
        claimed. Requires <code className="text-slate-300">PRESALE_ADMIN_SECRET</code>.
      </p>
      <div className="mt-8 max-w-3xl">
        <AdminOverview />
      </div>
    </div>
  );
}
