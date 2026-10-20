import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { Loading, Page, PageTitle } from "@/components/ui";
import { requireFarmer } from "@/lib/guard";
import { FarmerProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "農園情報 | LocAI" };

export default function FarmProfilePage() {
  return (
    <Page narrow>
      <PageTitle
        emoji="👩‍🌾"
        title="農園情報"
        lead="農園名・地域（市区町村まで）・品目・こだわり・紹介文はお店に公開されます。詳細住所と電話番号は、販売確定した取引の相手だけに表示されます。"
      />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { profile } = await requireFarmer();
  return (
    <div className="flex flex-col gap-6">
      <FarmerProfileForm
        initial={
          profile && {
            farmName: profile.farmName,
            prefecture: profile.prefecture,
            city: profile.city,
            addressLine: profile.addressLine,
            town: profile.town ?? "",
            building: profile.building ?? "",
            contactPhone: profile.contactPhone,
            postalCode: profile.postalCode ?? "",
            mapVisible: profile.mapVisible,
            mainItems: profile.mainItems ?? "",
            commitment: profile.commitment ?? "",
            introduction: profile.introduction ?? "",
            responseGuide: profile.responseGuide ?? "",
            availableWeekdays: profile.availableWeekdays?.split("・") ?? [],
            paymentConfirmGuideHours: profile.paymentConfirmGuideHours ?? 24,
          }
        }
      />
      <section className="card-soft flex flex-col gap-2">
        <h2 className="section-title">🔗 そのほか</h2>
        <Link href="/farm/simulator" className="btn-secondary justify-start">
          🧮 受取額の試算
        </Link>
        <Link href="/farm/reviews" className="btn-secondary justify-start">
          ✍️ あなたへの取引レビュー
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
