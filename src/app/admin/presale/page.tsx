import type { Metadata } from "next";
import Link from "next/link";
import { AdminPresaleConfirm } from "@/components/admin/AdminPresaleConfirm";

export const metadata: Metadata = {
  title: "Admin · Presale confirm",
  description:
    "Admin-gated confirm of past pending deposits and OLC delivery to buyer wallets.",
  robots: { index: false, follow: false },
};

export default function AdminPresalePage() {
  return (
    <div className="page-shell">
      <span className="badge">Admin</span>
      <h1 className="section-title mt-4">Presale admin confirm</h1>
      <p className="section-sub">
        Paste a past payment tx + buyer BlockDAG wallet. Requires{" "}
        <code className="text-slate-300">PRESALE_ADMIN_SECRET</code>. Public confirm-deposit is
        unchanged.
      </p>
      <div className="mt-8 max-w-3xl">
        <AdminPresaleConfirm />
      </div>
      <p className="mt-6 text-sm text-slate-500">
        See wallet balances and totals sold / claimed on the{" "}
        <Link href="/admin/overview" className="link-accent">
          admin overview
        </Link>
        .
      </p>
    </div>
  );
}
