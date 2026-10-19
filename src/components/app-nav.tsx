"use client";
// 立場ごとのメニュー。PCは上部、スマホは下部に固定する。今いるページを強調し、対応が必要な件数を添える
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; emoji: string; badge?: number; badgeLabel?: string; match: (p: string) => boolean };

export function AppNav({ role, badge }: { role: "FARMER" | "RESTAURANT"; badge: number | null }) {
  const pathname = usePathname();
  const items: Item[] =
    role === "FARMER"
      ? [
          { href: "/farm", label: "ホーム", emoji: "🏡", match: (p) => p === "/farm" },
          { href: "/farm/listings", label: "出品", emoji: "🌾", match: (p) => p.startsWith("/farm/listings") },
          {
            href: "/farm/orders",
            label: "注文",
            emoji: "📬",
            badge: badge ?? undefined,
            badgeLabel: "対応が必要な注文（回答待ち＋入金確認待ち）",
            match: (p) => p.startsWith("/farm/orders") || p.startsWith("/orders") || p.startsWith("/inquiries"),
          },
          { href: "/farm/profile", label: "農園情報", emoji: "👩‍🌾", match: (p) => p.startsWith("/farm/profile") || p.startsWith("/farm/simulator") },
        ]
      : [
          { href: "/shop", label: "ホーム", emoji: "🏡", match: (p) => p === "/shop" },
          { href: "/shop/search", label: "野菜をさがす", emoji: "🔍", match: (p) => p.startsWith("/shop/search") || p.startsWith("/shop/listings") },
          {
            href: "/shop/orders",
            label: "注文",
            emoji: "🧺",
            badge: badge ?? undefined,
            badgeLabel: "対応が必要な注文（再同意＋支払い＋受け取り確認）",
            match: (p) => p.startsWith("/shop/orders") || p.startsWith("/orders") || p.startsWith("/inquiries"),
          },
          { href: "/shop/profile", label: "マイページ", emoji: "🏮", match: (p) => p.startsWith("/shop/profile") },
        ];

  return (
    <>
      {/* PC：上部 */}
      <nav aria-label="メインメニュー" className="hidden flex-1 gap-1 md:flex">
        {items.map((it) => {
          const active = it.match(pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-11 items-center gap-1.5 rounded-full px-4 font-bold ${
                active ? "bg-leaf text-white" : "text-leaf-dark hover:bg-leaf-light"
              }`}
            >
              <span aria-hidden>{it.emoji}</span>
              {it.label}
              {!!it.badge && <Badge n={it.badge} label={it.badgeLabel!} />}
            </Link>
          );
        })}
      </nav>

      {/* スマホ：下部に固定 */}
      <nav
        id="bottom-nav"
        aria-label="メインメニュー"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-green-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {items.map((it) => {
            const active = it.match(pathname);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs leading-tight font-bold ${
                    active ? "text-leaf-dark" : "text-gray-700"
                  }`}
                >
                  {active && <span aria-hidden className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-leaf" />}
                  <span aria-hidden className="text-2xl">
                    {it.emoji}
                  </span>
                  <span className={active ? "underline decoration-2 underline-offset-2" : ""}>{it.label}</span>
                  {!!it.badge && (
                    <span className="absolute top-1 right-[calc(50%-1.9rem)]">
                      <Badge n={it.badge} label={it.badgeLabel!} />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function Badge({ n, label }: { n: number; label: string }) {
  return (
    <span
      className="inline-flex min-w-6 items-center justify-center rounded-full bg-tomato px-1.5 text-xs leading-6 font-bold text-white ring-2 ring-white"
      aria-label={`${label} ${n}件`}
      title={`${label} ${n}件`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
