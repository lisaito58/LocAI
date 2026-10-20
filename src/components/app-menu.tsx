"use client";
// 「☰ メニュー」：使い方・FAQ・表示設定など補助の機能をまとめる。
// よく使う操作（ホーム・検索／出品・注文）は下部メニューに残し、ここに全部を隠さない。ログアウトは最下部に区切って置く。
// ブラウザ標準の <dialog> を使うので、Escキーで閉じられ、開いている間はメニューの中だけをキーボードで移動できる。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { TextSizeToggle } from "@/components/text-size-toggle";

type Role = "FARMER" | "RESTAURANT" | null;

const LINKS: Record<"FARMER" | "RESTAURANT" | "GUEST", { href: string; label: string; emoji: string }[]> = {
  FARMER: [
    { href: "/help", label: "使い方・FAQ", emoji: "📖" },
    { href: "/farm/simulator", label: "受取額の試算", emoji: "🧮" },
    { href: "/farm/reviews", label: "あなたへの取引レビュー", emoji: "✍️" },
    { href: "/farm/profile", label: "農園情報", emoji: "👩‍🌾" },
  ],
  RESTAURANT: [
    { href: "/help", label: "使い方・FAQ", emoji: "📖" },
    { href: "/shop/loss", label: "仕入れの振り返り", emoji: "📝" },
    { href: "/shop/profile", label: "マイページ", emoji: "🏮" },
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
  const [open, setOpen] = useState(false);
  // ページを移動したら閉じる
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          ref.current?.showModal();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="menu-toggle ml-auto md:ml-0"
      >
        <span aria-hidden>☰</span> メニュー
      </button>
      <dialog
        ref={ref}
        aria-label="メニュー"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // 外側（背景）を押したら閉じる
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(22rem,100vw)] max-w-full bg-white p-0 text-foreground backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 pb-4">
          {/* ヘッダーと同じ高さの行に、「メニュー」と同じ大きさの「閉じる」を置く */}
          <div className="flex min-h-16 items-center justify-between gap-2 py-2">
            <h2 className="text-lg font-bold text-leaf-dark">☰ メニュー</h2>
            <button type="button" onClick={() => ref.current?.close()} className="menu-toggle" autoFocus>
              <span aria-hidden>✕</span> 閉じる
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
          {/* ログアウトは移動の項目と線・余白で区切り、いちばん下に置く */}
          {role && (
            <section className="mt-auto border-t-2 border-dashed border-gray-300 pt-5">
              <LogoutButton variant="menu" />
            </section>
          )}
        </div>
      </dialog>
    </>
  );
}
