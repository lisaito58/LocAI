import type { Metadata } from "next";
import { Suspense } from "react";
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
    <FarmerProfileForm
      initial={
        profile && {
          farmName: profile.farmName,
          prefecture: profile.prefecture,
          city: profile.city,
          addressLine: profile.addressLine,
          contactPhone: profile.contactPhone,
          mainItems: profile.mainItems ?? "",
          commitment: profile.commitment ?? "",
          introduction: profile.introduction ?? "",
          responseGuide: profile.responseGuide ?? "",
          availableWeekdays: profile.availableWeekdays?.split("・") ?? [],
          paymentConfirmGuideHours: profile.paymentConfirmGuideHours ?? 24,
        }
      }
    />
  );
}
