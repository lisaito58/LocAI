"use client";
// 初回の使い方案内（3枚）。「スキップ／次へ／はじめる」と現在位置を表示する。
// 初回はホームで1回だけ表示し、あとから「使い方」ページで見直せる。
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { completeOnboarding } from "@/app/actions/guide";

type Slide = { emoji: string; title: string; body: string; note?: string };

const SLIDES: Record<"FARMER" | "RESTAURANT", Slide[]> = {
  FARMER: [
    {
      emoji: "🌾",
      title: "野菜と販売条件を登録",
      body: "実物の写真、アプリで売る量、単価、送料、受け渡し日を入れて出品します。値段と量はあなたが決めます。",
    },
    {
      emoji: "📬",
      title: "店から届いた購入希望を確認",
      body: "お店ごとの希望が届きます。全部の量がそろわなくても、注文ごとに「承認・条件変更・見送り」を選べます。",
      note: "お店の申し込みだけでは、まだ販売確定ではありません。",
    },
    {
      emoji: "🤝",
      title: "承認して、外部で支払い・受け渡し",
      body: "承認すると販売確定です。代金の受け取りと発送・引き渡しはアプリの外で行い、アプリには記録だけを残します。",
      note: "アプリ内での決済や、配送業者の手配はありません。",
    },
  ],
  RESTAURANT: [
    {
      emoji: "🔍",
      title: "野菜を探す",
      body: "地元の農家さんの出品を見て、食材・量・予算・使う日で絞り込めます。",
    },
    {
      emoji: "🧺",
      title: "必要な量を申し込む",
      body: "販売単位の範囲で、必要な量だけ申し込めます。申し込むと「仮押さえ」になります。",
      note: "申し込みだけでは販売確定しません。農家さんの承認を待ちます。",
    },
    {
      emoji: "✅",
      title: "承認後、外部で支払い・受け取り",
      body: "農家さんが承認すると販売確定です。支払いと受け取りはアプリの外で行い、アプリには記録を残します。",
      note: "アプリ内での決済や、配送業者の手配はありません。",
    },
  ],
};

export function Onboarding({ role, mode }: { role: "FARMER" | "RESTAURANT"; mode: "first" | "page" }) {
  const slides = SLIDES[role];
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const last = i === slides.length - 1;
  const s = slides[i];

  useEffect(() => headingRef.current?.focus(), [i]);

  function finish() {
    if (mode === "first") {
      start(async () => {
        await completeOnboarding();
        setOpen(false);
      });
    } else {
      router.push(role === "FARMER" ? "/farm" : role === "RESTAURANT" ? "/shop" : "/");
    }
  }
  if (!open) return null;

  const body = (
    <div className="card mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="badge bg-leaf-light px-3 py-1 text-sm text-leaf-dark">
          使い方 {i + 1} / {slides.length}
        </span>
        {!last && (
          <button type="button" onClick={finish} disabled={pending} className="btn-secondary btn-sm">
            スキップ
          </button>
        )}
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-6xl" aria-hidden>
          {s.emoji}
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-leaf-dark outline-none">
          {i + 1}. {s.title}
        </h2>
        <p className="text-base leading-relaxed">{s.body}</p>
        {s.note && <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">⚠️ {s.note}</p>}
        {mode === "first" && last && <p className="text-sm text-gray-700">あとから「☰ メニュー」→「使い方・FAQ」でいつでも見直せます。</p>}
      </div>
      {/* 現在位置（色だけでなく形でも分かるように） */}
      <ol className="flex justify-center gap-2" aria-hidden>
        {slides.map((_, k) => (
          <li key={k} className={`h-2.5 rounded-full ${k === i ? "w-8 bg-leaf" : "w-2.5 border-2 border-leaf bg-white"}`} />
        ))}
      </ol>
      <div className="flex gap-2">
        {i > 0 && (
          <button type="button" onClick={() => setI(i - 1)} className="btn-secondary flex-1">
            ← 戻る
          </button>
        )}
        {last ? (
          <button type="button" onClick={finish} disabled={pending} className="btn-primary flex-1">
            {pending ? "準備中…" : "はじめる"}
          </button>
        ) : (
          <button type="button" onClick={() => setI(i + 1)} className="btn-primary flex-1">
            次へ →
          </button>
        )}
      </div>
    </div>
  );

  if (mode === "page") return body;
  return (
    <div role="dialog" aria-modal="true" aria-label="使い方の案内" className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="max-h-full w-full overflow-y-auto">{body}</div>
    </div>
  );
}
