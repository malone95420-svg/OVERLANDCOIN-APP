import { redirect } from "next/navigation";

/** Staking UI removed for now — keep route so old links do not 404. */
export default function StakingPage() {
  redirect("/");
}
