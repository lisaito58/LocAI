import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { AppMenu } from "@/components/app-menu";
import { AiChat } from "@/components/ai-chat";
import {
  farmerBadge,
  getFarmerTodo,
  getShopTodo,
  shopBadge,
} from "@/lib/domain/todo";
import { countUnreadInquiries } from "@/lib/domain/records";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function SiteHeader() {
  const user = await getCurrentUser();
  let badge: number | null = null;
  let inquiryUnread = 0;
  if (user) {
    try {
      inquiryUnread = await countUnreadInquiries(prisma, user.id, user.role);
    } catch {
      inquiryUnread = 0;
    }
    // バッジの件数が取れなくても、メニュー自体は表示する
    try {
      const now = new Date();
      if (user.role === "FARMER") {
        const p = await prisma.farmerProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (p) badge = farmerBadge(await getFarmerTodo(prisma, p.id, now));
      } else {
        const p = await prisma.restaurantProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (p) badge = shopBadge(await getShopTodo(prisma, p.id, now));
      }
    } catch {
      badge = null;
    }
  }
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-green-100 bg-white">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-2">
          <Link
            href={user ? (user.role === "FARMER" ? "/farm" : "/shop") : "/"}
            className="flex shrink-0 items-center gap-1.5 text-xl font-bold text-leaf-dark"
          >
            <span className="text-2xl" aria-hidden>
              🥬
            </span>
            LocAI
          </Link>
          {user ? (
            <AppNav role={user.role} badge={badge} />
          ) : (
            <span className="flex-1" />
          )}
          {!user && (
            <Link
              href="/login"
              className="btn-secondary btn-sm shrink-0 max-[359px]:hidden"
            >
              ログイン
            </Link>
          )}
          <AppMenu role={user?.role ?? null} inquiryUnread={inquiryUnread} />
        </div>
      </header>
      {user && <AiChat role={user.role} userId={user.id} />}
    </>
  );
}
