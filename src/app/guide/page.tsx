import type { Metadata } from "next";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding";
import { Loading, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: "使い方 | LocAI" };

export default function GuidePage() {
  return (
    <Page narrow>
      <PageTitle emoji="📖" title="使い方" />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const user = await requireUser();
  return <Onboarding role={user.role} mode="page" />;
}
