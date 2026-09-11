import type { Metadata } from "next";
import { DashboardPanel } from "@/components/DashboardPanel";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "OVERLANDCOIN explorer dashboard — locked OLC, quests completed, feed shortcuts, and adventure overview.",
};

export default function DashboardPage() {
  return (
    <div className="page-shell">
      <span className="badge">Overview</span>
      <p className="sr-only">Explorer dashboard</p>
      <div className="mt-4 max-w-4xl">
        <DashboardPanel />
      </div>
    </div>
  );
}
