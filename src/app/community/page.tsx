import { redirect } from "next/navigation";

/** Base44-style Community label — keep Adventure Feed at /feed */
export default function CommunityRedirectPage() {
  redirect("/feed");
}
