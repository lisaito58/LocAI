import { redirect } from "next/navigation";

// 以前の「使い方」ページは「使い方・FAQ」にまとめた
export default function GuidePage() {
  redirect("/help#how");
}
