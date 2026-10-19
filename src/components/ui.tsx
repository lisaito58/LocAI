// 画面で共通に使う部品
import type { ReactNode } from "react";
import type { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABELS } from "@/lib/domain/order-labels";

export function PageTitle({ emoji, title, lead }: { emoji: string; title: string; lead?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-leaf-dark sm:text-3xl">
        <span aria-hidden className="text-3xl sm:text-4xl">
          {emoji}
        </span>
        {title}
      </h1>
      {lead && <p className="mt-2 text-sm text-gray-700">{lead}</p>}
    </div>
  );
}

export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <main className={`mx-auto w-full ${narrow ? "max-w-xl" : "max-w-5xl"} px-4 py-8`}>{children}</main>;
}

export function Loading({ label = "読み込み中" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-leaf" role="status">
      <span className="float text-3xl" aria-hidden>
        🥕
      </span>
      <span className="font-bold">{label}…</span>
    </div>
  );
}

export function EmptyState({ emoji = "🌱", children }: { emoji?: string; children: ReactNode }) {
  return (
    <div className="card-soft flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-700">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  AWAITING_RESPONSE: "bg-amber-100 text-amber-800",
  AWAITING_REAGREEMENT: "bg-orange-100 text-orange-800",
  CONFIRMED: "bg-green-100 text-green-800",
  DECLINED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-gray-100 text-gray-600",
};
const STATUS_EMOJI: Record<OrderStatus, string> = {
  AWAITING_RESPONSE: "⏳",
  AWAITING_REAGREEMENT: "📝",
  CONFIRMED: "✅",
  DECLINED: "🍂",
  CANCELLED: "↩️",
  EXPIRED: "⌛",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${STATUS_STYLE[status]}`}>
      <span aria-hidden>{STATUS_EMOJI[status]}</span>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const style = {
    info: "border-green-200 bg-leaf-light text-leaf-dark",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    ok: "border-green-300 bg-green-50 text-green-900",
  }[tone];
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${style}`}>{children}</div>;
}

export function Stat({ label, value, emoji, tone }: { label: string; value: string; emoji: string; tone?: string }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${tone ?? "bg-leaf-light"}`}>
      <div className="text-xs text-gray-700">
        <span aria-hidden>{emoji} </span>
        {label}
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

// 食材名から絵文字を選ぶ（見た目だけ。該当がなければ葉っぱ）
const ITEM_EMOJI: [RegExp, string][] = [
  [/茄子|なす|ナス/, "🍆"],
  [/唐辛子|とうがらし|ししとう|ピーマン|万願寺|伏見/, "🌶️"],
  [/トマト|とまと/, "🍅"],
  [/人参|にんじん|ニンジン/, "🥕"],
  [/とうもろこし|コーン/, "🌽"],
  [/きゅうり|胡瓜/, "🥒"],
  [/玉ねぎ|たまねぎ|葱|ねぎ|ネギ/, "🧅"],
  [/にんにく|ニンニク/, "🧄"],
  [/じゃがいも|芋|いも|イモ/, "🥔"],
  [/ブロッコリー/, "🥦"],
  [/きのこ|しいたけ|椎茸|茸/, "🍄"],
  [/かぼちゃ|南瓜/, "🎃"],
  [/大根|だいこん|かぶ|蕪/, "🤍"],
  [/豆|まめ/, "🫛"],
  [/パプリカ/, "🫑"],
];

export function itemEmoji(name: string) {
  return ITEM_EMOJI.find(([re]) => re.test(name))?.[1] ?? "🥬";
}

// 検索結果0件などの「エラーではない」案内。赤や黄色の強い色を使わず、くすんだアプリコット色で落ち着いて示す
export function CalmNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-3xl border border-[#e9d3c0] bg-[#fbf0e6] p-5 text-[#3d3a37]">
      <p className="text-lg font-bold">{title}</p>
      {children}
    </div>
  );
}
