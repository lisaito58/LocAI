// ホームの「今やること」の1項目。0件は「なし」と文字でも示す
import Link from "next/link";
import type { ReactNode } from "react";

export function TodoCard({
  href,
  emoji,
  label,
  count,
  sub,
  tone = "action",
}: {
  href: string;
  emoji: string;
  label: string;
  count: number;
  sub?: ReactNode;
  tone?: "action" | "info";
}) {
  const active = count > 0 && tone === "action";
  return (
    <Link
      href={href}
      className={`flex min-h-20 items-center gap-3 rounded-3xl border-2 p-4 transition hover:shadow-md ${
        active ? "border-amber-300 bg-amber-50" : "border-green-100 bg-white"
      }`}
    >
      <span aria-hidden className="text-3xl">
        {emoji}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">{label}</span>
        {sub && <span className="text-sm text-gray-700">{sub}</span>}
      </span>
      <span className="shrink-0 text-right">
        {count > 0 ? (
          <>
            <span className="text-3xl font-bold text-leaf-dark">{count}</span>
            <span className="ml-0.5 text-sm font-bold">件</span>
            {active && <span className="block text-xs font-bold text-amber-900">対応が必要</span>}
          </>
        ) : (
          <span className="text-base font-bold text-gray-700">なし</span>
        )}
      </span>
      <span aria-hidden className="text-xl text-leaf">
        ›
      </span>
    </Link>
  );
}
