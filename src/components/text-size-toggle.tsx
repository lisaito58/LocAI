"use client";
// 文字サイズ「標準／大きめ」の切り替え。このブラウザに保存する（ログアウトしても消さない表示設定）
import { useSyncExternalStore } from "react";

export const TEXT_SIZE_KEY = "locai-pref:text-size";

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const getLarge = () => document.documentElement.dataset.text === "large";

export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribe, getLarge, () => false);
  function set(next: boolean) {
    document.documentElement.dataset.text = next ? "large" : "standard";
    try {
      localStorage.setItem(TEXT_SIZE_KEY, next ? "large" : "standard");
    } catch {}
    listeners.forEach((fn) => fn());
  }
  return (
    <div role="group" aria-label="文字の大きさ" className="flex shrink-0 items-center rounded-full border-2 border-green-100 bg-white p-0.5 text-sm font-bold">
      <span className="px-2 text-gray-700 max-sm:sr-only">文字</span>
      <button
        type="button"
        aria-pressed={!large}
        onClick={() => set(false)}
        className={`min-h-10 rounded-full px-3 ${!large ? "bg-leaf text-white" : "text-leaf-dark"}`}
      >
        標準
      </button>
      <button
        type="button"
        aria-pressed={large}
        onClick={() => set(true)}
        className={`min-h-10 rounded-full px-3 ${large ? "bg-leaf text-white" : "text-leaf-dark"}`}
      >
        大きめ
      </button>
    </div>
  );
}
