"use client";
// 「☰ メニュー」：使い方・FAQ・表示設定など補助の機能をまとめる。
// よく使う操作（ホーム・検索／出品・注文）は下部メニューに残し、ここに全部を隠さない。ログアウトは置かない。
// ブラウザ標準の <dialog> を使うので、Escキーで閉じられ、開いている間はメニューの中だけをキーボードで移動できる。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { TextSizeToggle } from "@/components/text-size-toggle";

type Role = "FARMER" | "RESTAURANT" | null;

const LINKS: Record<"FARMER" | "RESTAURANT" | "GUEST", { href: string; label: string; emoji: string }[]> = {
  FARMER: [
    { href: "/help", label: "使い方・FAQ", emoji: "📖" },
    { href: "/farm/simulator", label: "受取額の試算", emoji: "🧮" },
    { href: "/farm/reviews", label: "あなたへの取引レビュー", emoji: "✍️" },
    { href: "/farm/profile", label: "農園情報（ログアウトはこの画面の一番下）", emoji: "👩‍🌾" },
  ],
  RESTAURANT: [
    { href: "/help", label: "使い方・FAQ", emoji: "📖" },
    { href: "/shop/loss", label: "仕入れの振り返り", emoji: "📝" },
    { href: "/shop/profile", label: "マイページ（ログアウトはこの画面の一番下）", emoji: "🏮" },
  ],
  GUEST: [
    { href: "/help", label: "使い方・FAQ", emoji: "📖" },
    { href: "/login", label: "ログイン", emoji: "🔑" },
    { href: "/signup", label: "新規登録", emoji: "🌱" },
  ],
};

export function AppMenu({ role }: { role: Role }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  // ページを移動したら閉じる
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className="ml-auto flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-green-200 bg-white px-3 font-bold text-leaf-dark hover:bg-leaf-light md:ml-0"
      >
        <span aria-hidden>☰</span> メニュー
      </button>
      <dialog
        ref={ref}
        aria-label="メニュー"
        onClick={(e) => {
          // 外側（背景）を押したら閉じる
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(22rem,100vw)] max-w-full bg-white p-0 text-foreground backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-leaf-dark">☰ メニュー</h2>
            <button type="button" onClick={() => ref.current?.close()} className="btn-secondary btn-sm" autoFocus>
              ✕ 閉じる
            </button>
          </div>
          <nav aria-label="補助メニュー">
            <ul className="flex flex-col gap-2">
              {LINKS[role ?? "GUEST"].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="btn-secondary w-full justify-start text-left">
                    <span aria-hidden>{l.emoji}</span>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <section className="rounded-2xl bg-leaf-light/60 p-3">
            <h3 className="label mb-2">表示設定：文字の大きさ</h3>
            <TextSizeToggle />
            <p className="hint mt-2">このブラウザに保存されます。ログアウトしても変わりません。</p>
          </section>
        </div>
      </dialog>
    </>
  );
}
