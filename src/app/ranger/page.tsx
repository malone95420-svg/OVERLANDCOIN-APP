import type { Metadata } from "next";
import Link from "next/link";
import { RangerChat } from "@/components/RangerChat";

export const metadata: Metadata = {
  title: "RANGER",
  description: "Ask RANGER — safety-first overland assistant for quests matching your vehicle.",
};

export default function RangerPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Trail assistant</span>
      <h1 className="section-title mt-4">RANGER</h1>
      <p className="section-sub">
        RANGER online. I know every trail on Earth — or every waypoint in our growing catalog.
        Local rule-based brains for v1; structured so an LLM can plug in later via{" "}
        <code className="text-slate-400">RANGER_API</code>.
      </p>
      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/garage" className="btn-secondary !py-2 !text-xs">
          Set up Garage
        </Link>
        <Link href="/map" className="btn-secondary !py-2 !text-xs">
          Quest Map
        </Link>
      </div>
      <div className="mt-10 max-w-2xl">
        <RangerChat />
      </div>
    </div>
  );
}
