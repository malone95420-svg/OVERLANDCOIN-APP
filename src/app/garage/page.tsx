import type { Metadata } from "next";
import { GarageForm } from "@/components/GarageForm";

export const metadata: Metadata = {
  title: "Vehicle Garage",
  description: "Store your overland vehicle and upgrades. Capability tier filters quests on the map.",
};

export default function GaragePage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Local garage</span>
      <h1 className="section-title mt-4">Vehicle Garage</h1>
      <p className="section-sub">
        Log your rig and upgrades. We score a capability tier (Stock → Extreme) and use it to filter
        Quest Map pins. Data stays in your browser (localStorage) for now.
      </p>
      <div className="mt-10">
        <GarageForm />
      </div>
    </div>
  );
}
