import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding";
import { TodoCard } from "@/components/todo-card";
import { itemEmoji, Loading, Notice, Page } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { pickEarlySale, searchListings } from "@/lib/domain/search";
import { getShopTodo, jstDayRange, type ShopTodo } from "@/lib/domain/todo";
import { dateToJstDateText, formatDateOnly, formatJst, formatKg } from "@/lib/domain/units";
import { countUnreadInquiries } from "@/lib/domain/records";
import { requireRestaurant } from "@/lib/guard";
import { isServicePrefecture } from "@/lib/validation/listing";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "ホーム | LocAI" };

export default function ShopHomePage() {
  return (
    <Page>
      <Suspense fallback={<Loading label="今やることを読み込み中" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { user, profile } = await requireRestaurant();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { onboardedAt: true } });
  return (
    <div className="flex flex-col gap-6">
      {!me?.onboardedAt && <Onboarding role="RESTAURANT" mode="first" />}
      <div>
        <p className="text-gray-700">{user.name} さん、こんにちは 🏮</p>
        <h1 className="text-2xl font-bold text-leaf-dark">🏡 ホーム</h1>
      </div>
      {!profile ? (
        <Notice tone="warn">
          はじめに <Link href="/shop/profile" className="link">マイページ</Link> で店舗情報を登録してください。届け先の地域を送料の計算に使います。
        </Notice>
      ) : (
        <>
          {!isServicePrefecture(profile.prefecture) && (
        <Notice tone="warn">
          登録済みの届け先（{profile.prefecture}）は対象地域外です。対象は関西2府4県です。<Link href="/shop/profile" className="link">マイページ</Link>で設定し直してください（これまでの注文の情報はそのまま残ります）。
        </Notice>
      )}
          <Link href="/shop/search" className="btn-primary py-4 text-xl">
            🔍 野菜をさがす
          </Link>
          <section className="flex flex-col gap-3" aria-labelledby="todo-h">
            <h2 id="todo-h" className="section-title">
              📋 今やること
            </h2>
            <Suspense fallback={<Loading label="件数を読み込み中" />}>
              <TodoList restaurantId={profile.id} userId={user.id} />
            </Suspense>
          </section>
          <Suspense fallback={<Loading label="確保済みの食材を読み込み中" />}>
            <Secured restaurantId={profile.id} />
          </Suspense>
          <Suspense fallback={null}>
            <LossEntry restaurantId={profile.id} />
          </Suspense>
          <Suspense fallback={null}>
            <EarlySale userId={user.id} />
          </Suspense>
        </>
      )}
    </div>
  );
}

async function TodoList({ restaurantId, userId }: { restaurantId: string; userId: string }) {
  let todo: ShopTodo;
  let inquiries = 0;
  try {
    await expireDueOrders(prisma, { restaurantId });
    todo = await getShopTodo(prisma, restaurantId, new Date());
    inquiries = await countUnreadInquiries(prisma, userId, "RESTAURANT");
  } catch {
    return <Notice tone="error">件数を取得できませんでした（0件という意味ではありません）。少し待ってから画面を再読み込みしてください。</Notice>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TodoCard href="/shop/orders#reagreement" emoji="📝" label="条件変更の確認・再同意" count={todo.needsReagreement} sub="農家さんが数量・日時・送料の変更を提案" />
      <TodoCard href="/shop/orders#payment" emoji="💴" label="支払いが必要" count={todo.paymentNeeded} sub="アプリ外で支払い、申告してください" />
      <TodoCard href="/shop/orders#receive" emoji="📦" label="受け取りの確認が必要" count={todo.receiveNeeded} sub="受け取ったら記録してください" />
      <TodoCard href="/inquiries" emoji="💬" label="返信が届いた相談" count={inquiries} sub="農家さんへの質問の新着（注文とは別）" />
      <TodoCard
        href="/shop/orders#awaiting"
        emoji="⏳"
        label="農家さんの回答待ち"
        count={todo.awaitingFarmer}
        sub="まだ確保できていません（販売確定ではない）"
        tone="info"
      />
    </div>
  );
}

// 使用日別の確保済み食材（販売確定したものだけ。回答待ちは含めない）
async function Secured({ restaurantId }: { restaurantId: string }) {
  const { start } = jstDayRange(new Date());
  const today = new Date(`${dateToJstDateText(start)}T00:00:00Z`);
  let orders;
  try {
    orders = await prisma.order.findMany({
      where: { restaurantId, status: "CONFIRMED", useDate: { gte: today } },
      orderBy: [{ useDate: "asc" }, { snapScheduleStartsAt: "asc" }],
      take: 30,
      select: { id: true, snapItemName: true, quantityGrams: true, useDate: true, snapScheduleStartsAt: true, farmer: { select: { farmName: true } } },
    });
  } catch {
    return <Notice tone="error">確保済みの食材を読み込めませんでした。</Notice>;
  }
  const byDate = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.useDate.toISOString().slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), o]);
  }
  return (
    <section className="card flex flex-col gap-3">
      <h2 className="section-title">🍽️ 使用日別の確保済み食材（販売確定のみ）</h2>
      {byDate.size === 0 ? (
        <p className="text-gray-700">これから使う、販売確定した食材はまだありません。</p>
      ) : (
        [...byDate].map(([d, list]) => (
          <div key={d}>
            <div className="font-bold text-leaf-dark">📅 {formatDateOnly(list[0].useDate)} に使う</div>
            <ul className="mt-1 flex flex-col gap-1">
              {list.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex flex-wrap gap-2 rounded-xl bg-leaf-light/50 px-3 py-2 hover:bg-leaf-light">
                    <strong>
                      {itemEmoji(o.snapItemName)} {o.snapItemName} {formatKg(o.quantityGrams)}
                    </strong>
                    <span>👩‍🌾 {o.farmer.farmName}</span>
                    <span className="ml-auto text-sm">受け渡し {formatJst(o.snapScheduleStartsAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

// 仕入れの振り返り（任意）。受け取った注文のうち、振り返りが終わっていない件数を示す
async function LossEntry({ restaurantId }: { restaurantId: string }) {
  let pending: number | null = null;
  try {
    pending = await prisma.order.count({
      where: {
        restaurantId,
        status: "CONFIRMED",
        fulfillment: { buyerReceivedAt: { not: null } },
        OR: [{ lossRecord: null }, { lossRecord: { status: "IN_USE" } }],
      },
    });
  } catch {
    pending = null;
  }
  return (
    <TodoCard
      href="/shop/loss"
      emoji="📝"
      label="仕入れの振り返り（任意）"
      count={pending ?? 0}
      sub={pending === null ? "件数を取得できませんでした" : "使い切れたかを記録すると、次の注文量の参考になります"}
      tone="info"
    />
  );
}

// 早めに販売したい野菜（条件未指定なので、地域・予算・日程は未確認と明示する）
async function EarlySale({ userId }: { userId: string }) {
  let picks;
  try {
    const seed = `home${dateToJstDateText(new Date()).replace(/-/g, "")}`;
    const result = await searchListings(prisma, userId, {
      itemQuery: "",
      itemMode: "ANY",
      deliveryMethod: "ANY",
      extraGrams: 0,
      showUnsetShipping: false,
      sort: "fair",
      seed,
    });
    picks = pickEarlySale(result.normal, seed);
  } catch {
    return null;
  }
  if (picks.length === 0) return null;
  return (
    <section className="rounded-3xl border-2 border-orange-200 bg-orange-50/70 p-4">
      <h2 className="section-title text-orange-950">⏳ 早めに販売したい野菜</h2>
      <p className="mt-1 text-sm text-gray-800">
        農家さんが「この日時までに販売を決めたい」と希望している出品です。早く届くという意味ではなく、承認も保証されません。数量・予算・使用日は未確認なので、詳細画面で確認してください。
      </p>
      <ul className="mt-3 grid gap-2 sm:auto-rows-fr sm:grid-cols-2">
        {picks.map((c) => (
          <li key={c.listingId}>
            <Link href={`/shop/listings/${c.listingId}`} className="flex h-full flex-col gap-0.5 rounded-2xl bg-white p-3 hover:ring-2 hover:ring-orange-300">
              <span className="font-bold">
                {itemEmoji(c.itemName)} {c.itemName}
              </span>
              <span className="text-sm text-gray-800">{c.farmName}</span>
              <span className="mt-auto pt-1 text-sm">販売希望期限 {formatJst(c.saleTargetAt!)}</span>
              <span className="text-sm">受け渡し {formatJst(c.firstSlotAt)}〜（登録された日程）</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
