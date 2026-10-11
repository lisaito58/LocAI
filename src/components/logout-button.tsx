"use client";
// ログアウト時に、このブラウザの下書き（検索条件・出品の入力途中）も消す
import { signOut } from "@/app/auth-actions";

export function LogoutButton() {
  return (
    <form
      action={signOut}
      onSubmit={() => {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith("locai:"))
            .forEach((k) => localStorage.removeItem(k));
        } catch {}
      }}
      className="shrink-0"
    >
      <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-green-900/70 hover:bg-leaf-light">
        ログアウト
      </button>
    </form>
  );
}
