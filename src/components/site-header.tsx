import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/session";

const NAV = {
  RESTAURANT: [
    { href: "/shop/search", label: "🔍 野菜をさがす" },
    { href: "/shop/orders", label: "🧺 マイページ" },
    { href: "/shop/profile", label: "🏮 店舗情報" },
  ],
  FARMER: [
    { href: "/farm", label: "🌾 出品一覧" },
    { href: "/farm/orders", label: "📬 届いた注文" },
    { href: "/farm/simulator", label: "🧮 受取額の試算" },
    { href: "/farm/profile", label: "👩‍🌾 農園情報" },
  ],
} as const;

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-20 border-b border-green-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 text-xl font-bold text-leaf-dark">
          <span className="text-2xl" aria-hidden>
            🥬
          </span>
          LocAI
        </Link>
        {user ? (
          <>
            <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 text-sm whitespace-nowrap">
              {NAV[user.role].map((n) => (
                <Link key={n.href} href={n.href} className="rounded-full px-3 py-1.5 font-bold text-leaf-dark hover:bg-leaf-light">
                  {n.label}
                </Link>
              ))}
            </nav>
            <LogoutButton />
          </>
        ) : (
          <nav className="ml-auto flex gap-2 text-sm">
            <Link href="/login" className="btn-secondary btn-sm">
              ログイン
            </Link>
            <Link href="/signup" className="btn-primary btn-sm">
              新規登録
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
