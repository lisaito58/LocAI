"use client";
// ログアウト。押すと確認し、未保存の入力があれば失われる内容を案内する。
// 共有端末で次の人に見えないよう、このブラウザの下書き（検索条件・出品の入力途中）も消す。
import { signOut } from "@/app/auth-actions";

export function LogoutButton({ variant = "page" }: { variant?: "page" | "menu" }) {
  return (
    <form
      action={signOut}
      onSubmit={(e) => {
        const dirty = [...document.querySelectorAll<HTMLFormElement>("form[data-dirty='true']")]
          .map((f) => f.dataset.dirtyLabel)
          .filter(Boolean);
        const lines = ["ログアウトしますか？"];
        if (dirty.length) lines.push(`\n保存していない「${dirty.join("」「")}」の変更は失われます。`);
        lines.push("\nこのブラウザに保存した入力途中の下書き（出品・検索条件）とAI相談の会話も消去されます。");
        if (!window.confirm(lines.join(""))) {
          e.preventDefault();
          return;
        }
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith("locai:"))
            .forEach((k) => localStorage.removeItem(k));
          sessionStorage.clear();
        } catch {}
      }}
    >
      <button
        type="submit"
        className={variant === "menu" ? "btn w-full border-2 border-red-200 bg-white text-red-800 hover:bg-red-50" : "btn-danger w-full"}
      >
        🚪 ログアウト
      </button>
    </form>
  );
}

// フォームの入力が変わったら「未保存」の目印を付ける（ログアウト時の案内用）
export function markDirty(e: { currentTarget: HTMLFormElement }) {
  e.currentTarget.dataset.dirty = "true";
}
