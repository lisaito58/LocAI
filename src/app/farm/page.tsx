import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding";
import { TodoCard } from "@/components/todo-card";
import { Loading, Notice, Page } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { getFarmerTodo, SOON_HOURS, type FarmerTodo } from "@/lib/domain/todo";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "ホーム | LocAI" };

export default function FarmHomePage() {
  return (
    <Page>
      <Suspense fallback={<Loading label="今やることを読み込み中" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { user, profile } = await requireFarmer();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { onboardedAt: true } });
  return (
    <div className="flex flex-col gap-6">
      {!me?.onboardedAt && <Onboarding role="FARMER" mode="first" />}
      <div>
        <p className="text-gray-700">{user.name} さん、こんにちは 👩‍🌾</p>
        <h1 className="text-2xl font-bold text-leaf-dark">🏡 ホーム</h1>
      </div>

      {!profile ? (
        <Notice tone="warn">
          はじめに <Link href="/farm/profile" className="link">農園情報</Link> を登録してください。登録すると出品できます。
        </Notice>
      ) : (
        <>
          <Link href="/farm/listings/new" className="btn-primary py-4 text-xl">
            ＋ 野菜を出品する
          </Link>
          <section className="flex flex-col gap-3" aria-labelledby="todo-h">
            <h2 id="todo-h" className="section-title">
              📋 今やること
            </h2>
            <TodoList farmerId={profile.id} />
          </section>
          <section className="card-soft flex flex-wrap gap-2">
            <Link href="/farm/listings" className="btn-secondary btn-sm">
              🌾 出品一覧・残量
            </Link>
            <Link href="/farm/simulator" className="btn-secondary btn-sm">
              🧮 受取額の試算
            </Link>
            <Link href="/guide" className="btn-secondary btn-sm">
              📖 使い方
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

async function TodoList({ farmerId }: { farmerId: string }) {
  let todo: FarmerTodo;
  try {
    await expireDueOrders(prisma, { farmerId });
    todo = await getFarmerTodo(prisma, farmerId, new Date());
  } catch {
    return (
      <Notice tone="error">
        件数を取得できませんでした（0件という意味ではありません）。少し待ってから画面を再読み込みしてください。
      </Notice>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TodoCard
        href="/farm/orders#awaiting"
        emoji="📬"
        label="回答待ちの購入希望"
        count={todo.awaitingResponse}
        sub={
          todo.awaitingResponse > 0
            ? `うち今日が回答期限：${todo.dueToday}件`
            : "承認・条件変更・見送りを選ぶ注文"
        }
      />
      <TodoCard href="/farm/orders#payment" emoji="💴" label="入金確認待ち" count={todo.paymentToConfirm} sub="お店が支払いを申告した注文" />
      <TodoCard href="/farm/orders#handover" emoji="🚚" label="今日の発送・引き渡し予定" count={todo.handoverToday} sub="まだ記録していないもの" />
      <TodoCard
        href="/farm/listings#soon"
        emoji="⏳"
        label="販売希望期限が近い出品"
        count={todo.saleTargetSoon}
        sub={`${SOON_HOURS}時間以内・受付中で残りあり`}
      />
      {todo.waitingShopReagreement > 0 && (
        <TodoCard
          href="/farm/orders#reagreement"
          emoji="📝"
          label="お店の再同意待ち（あなたの対応は不要）"
          count={todo.waitingShopReagreement}
          tone="info"
        />
      )}
    </div>
  );
}
