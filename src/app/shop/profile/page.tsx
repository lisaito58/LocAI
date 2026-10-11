import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading, Page, PageTitle } from "@/components/ui";
import { requireRestaurant } from "@/lib/guard";
import { RestaurantProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "店舗情報 | LocAI" };

export default function ShopProfilePage() {
  return (
    <Page narrow>
      <PageTitle
        emoji="🏮"
        title="店舗情報"
        lead="市区町村までは農家さんに見えます。詳細住所と電話番号は、販売確定した取引の相手だけに表示されます。"
      />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { profile } = await requireRestaurant();
  return (
    <RestaurantProfileForm
      initial={
        profile && {
          shopName: profile.shopName,
          prefecture: profile.prefecture,
          city: profile.city,
          addressLine: profile.addressLine,
          contactPhone: profile.contactPhone,
        }
      }
    />
  );
}
