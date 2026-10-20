import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { Loading, Page, PageTitle } from "@/components/ui";
import { requireRestaurant } from "@/lib/guard";
import { RestaurantProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "マイページ | LocAI" };

export default function ShopProfilePage() {
  return (
    <Page narrow>
      <PageTitle emoji="🏮" title="マイページ" lead="店舗情報の変更、使い方の確認、ログアウトができます。" />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { profile } = await requireRestaurant();
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="section-title mb-3">🏮 店舗情報</h2>
        <RestaurantProfileForm
          initial={
            profile && {
              shopName: profile.shopName,
              prefecture: profile.prefecture,
              city: profile.city,
              addressLine: profile.addressLine,
              town: profile.town ?? "",
              building: profile.building ?? "",
              contactPhone: profile.contactPhone,
              postalCode: profile.postalCode ?? "",
            }
          }
        />
      </section>
      <section className="card-soft flex flex-col gap-2">
        <h2 className="section-title">🔗 そのほか</h2>
        <Link href="/shop/orders" className="btn-secondary justify-start">
          🧺 注文・取引の一覧を見る
        </Link>
        <Link href="/help" className="btn-secondary justify-start">
          📖 使い方を見る
        </Link>
      </section>
      {/* ログアウトは保存ボタンから離して、いちばん下に置く */}
      <section className="mt-10 border-t-2 border-dashed border-green-200 pt-8">
        <LogoutButton />
      </section>
    </div>
  );
}
