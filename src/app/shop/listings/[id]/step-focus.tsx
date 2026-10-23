"use client";
// 申込の手順を進めたあと、次に見るべき見出し（日程の選択・合計と期限・エラー）へ表示位置を合わせる。
// - 利用者がボタンを押した直後の1回だけ動く（検索から開いたときや、自分でスクロールしている途中には動かない）
// - 新しい内容が描画されてから動く（待ち時間に頼らない）。見出しにフォーカスを移して、読み上げでも気づけるようにする
// - 動きを減らす設定の端末では、なめらかなスクロールを使わない
import { useEffect } from "react";

const KEY = "locai:order-step-pending";

export function markStepPending() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {}
}

export function StepFocus({ targetId }: { targetId: string }) {
  useEffect(() => {
    let pending = false;
    try {
      pending = sessionStorage.getItem(KEY) === "1";
      sessionStorage.removeItem(KEY);
    } catch {}
    if (!pending) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [targetId]);
  return null;
}
