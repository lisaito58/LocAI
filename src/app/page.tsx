import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

const FLOATING = ["🍆", "🥕", "🌶️", "🥬", "🍅", "🌽", "🥒", "🧅", "🥔", "🫑", "🥦", "🍄"];

export default function Home() {
  return (
    <main className="flex flex-col">
      {/* ヒーロー */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {FLOATING.map((e, i) => (
            <span
              key={e}
              className="float absolute text-3xl opacity-80 sm:text-5xl"
              style={{
                left: `${(i * 83) % 96}%`,
                top: `${(i * 37) % 85}%`,
                animationDelay: `${(i % 5) * 0.7}s`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-16 pb-20 text-center">
          <span className="badge mb-4 bg-white/90 px-4 py-1 text-sm text-leaf shadow-sm">🌱 地産地消 × 必要な量だけ</span>
          <h1 className="text-3xl leading-tight font-bold text-leaf-dark sm:text-5xl">
            地元の野菜を、
            <br />
            <span className="relative inline-block">
              必要な量で。
              <span aria-hidden className="absolute -bottom-1 left-0 h-3 w-full -rotate-1 rounded-full bg-sprout/40" />
            </span>
          </h1>
          <p className="mt-5 text-lg font-bold text-green-900/80">農家と店をつなぐ 🚜 🤝 🏮</p>
          <p className="mt-4 max-w-xl rounded-3xl bg-white/85 p-4 text-sm leading-relaxed text-green-900/80 shadow-sm">
            農家さんはまとまった在庫を一度出品するだけ。飲食店は販売単位の範囲で
            <strong>必要な量だけ</strong>購入希望を送れます。農家さんは複数のお店の希望をまとめて見て、注文ごとに販売を決められます。
          </p>
          <Suspense fallback={<RoleButtons />}>
            <HeroActions />
          </Suspense>
        </div>
      </section>

      {/* 2つの立場 */}
      <section className="mx-auto grid w-full max-w-5xl gap-5 px-4 sm:grid-cols-2">
        <RoleCard
          emoji="🏮"
          title="飲食店のみなさま"
          lead="市場で先に押さえられた…を減らしたい"
          steps={[
            ["🔍", "食材・量・送料込み予算・使用日で検索"],
            ["🤖", "AIが「お店に合う理由」をひとこと説明"],
            ["🧺", "必要な量だけ購入希望 → 農家さんの承認で確定"],
          ]}
        />
        <RoleCard
          emoji="👩‍🌾"
          title="農家のみなさま"
          lead="値段は自分で決めて、直接お店へ"
          steps={[
            ["📸", "実物写真と、アプリ用の量・単価・送料表を一度出品"],
            ["📬", "複数のお店の希望が一覧に集まる"],
            ["✅", "全量そろわなくても、注文ごとに承認・条件変更・見送り"],
          ]}
        />
      </section>

      {/* 在庫の見える化 */}
      <section className="mx-auto mt-12 w-full max-w-5xl px-4">
        <div className="card">
          <h2 className="section-title">
            <span aria-hidden>📦</span>売りすぎない仕組み
          </h2>
          <p className="mt-2 text-sm text-green-900/70">
            決まった量と予約中（仮押さえ）の量を足しても、出品した量を超えません。期限が過ぎた仮押さえは自動で戻ります。
          </p>
          <div className="mt-4 flex h-10 overflow-hidden rounded-full border-2 border-green-100 text-xs font-bold text-white">
            <div className="flex items-center justify-center bg-leaf-dark" style={{ width: "16.7%" }}>
              確定5kg
            </div>
            <div className="flex items-center justify-center bg-corn text-amber-900" style={{ width: "23.3%" }}>
              仮押さえ7kg
            </div>
            <div className="flex flex-1 items-center justify-center bg-leaf-light text-leaf-dark">申込可能 18kg</div>
          </div>
          <p className="mt-2 text-right text-xs text-green-900/60">例：賀茂茄子 30kg の出品 🍆</p>
        </div>
      </section>

      {/* 約束 */}
      <section className="mx-auto mt-12 w-full max-w-5xl px-4">
        <h2 className="section-title justify-center text-xl">
          <span aria-hidden>🌻</span>LocAI の約束
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["⚖️", "金額はアプリが計算", "単価×量＋送料をサーバーで計算します。"],
            ["🙈", "他人の情報は見えない", "注文・住所・相談は当事者だけ。住所は確定後に開示。"],
            ["🤖", "AIは決めない", "値段・在庫・並び順・売買はAIでなく人とアプリのルールで。"],
            ["🌱", "公平に並べる", "人気順だけにせず、始めたばかりの農家さんも表示します。"],
            ["♻️", "食品ロスを減らす", "必要な量だけ買えて、残った分も再公開で売る機会をつくります。"],
            ["💴", "決済・配送はアプリ外", "支払い・発送は当事者が行い、アプリには記録だけを残します。"],
          ].map(([e, t, d]) => (
            <div key={t} className="card-soft">
              <div className="text-2xl" aria-hidden>
                {e}
              </div>
              <div className="mt-1 font-bold text-leaf-dark">{t}</div>
              <p className="mt-1 text-xs leading-relaxed text-green-900/70">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function RoleCard({ emoji, title, lead, steps }: { emoji: string; title: string; lead: string; steps: string[][] }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-leaf-light text-3xl" aria-hidden>
          {emoji}
        </span>
        <div>
          <h2 className="text-lg font-bold text-leaf-dark">{title}</h2>
          <p className="text-xs text-green-900/60">{lead}</p>
        </div>
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map(([e, s], i) => (
          <li key={s} className="flex items-start gap-3 rounded-2xl bg-leaf-light/50 px-3 py-2 text-sm">
            <span className="font-bold text-leaf">{i + 1}</span>
            <span aria-hidden>{e}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoleButtons() {
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <Link href="/signup?role=RESTAURANT" className="btn-primary text-base">
        🏮 飲食店として始める
      </Link>
      <Link href="/signup?role=FARMER" className="btn-secondary text-base">
        🥬 野菜を販売する
      </Link>
    </div>
  );
}

async function HeroActions() {
  const user = await getCurrentUser();
  if (!user) return <RoleButtons />;
  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <p className="text-sm text-green-900/70">{user.name} さん、おかえりなさい 👋</p>
      {user.role === "RESTAURANT" ? (
        <Link href="/shop/search" className="btn-primary text-base">
          🔍 野菜をさがす
        </Link>
      ) : (
        <Link href="/farm" className="btn-primary text-base">
          🌾 出品一覧へ
        </Link>
      )}
    </div>
  );
}
