import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, itemEmoji, Loading, Page, PageTitle } from "@/components/ui";
import { listMyInquiries } from "@/lib/domain/records";
import { formatJst } from "@/lib/domain/units";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "相談一覧 | LocAI" };

export default function InquiriesPage() {
  return (
    <Page>
      <PageTitle emoji="💬" title="相談一覧" lead="出品についての質問・相談のやり取りです。画面を閉じても相談は残り、ここから続けられます。" />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const user = await requireUser();
  const list = await listMyInquiries(prisma, user.id, user.role);
  if (list.length === 0) {
    return (
      <EmptyState emoji="💬">
        {user.role === "RESTAURANT" ? "まだ相談はありません。出品の画面の「農家さんに質問する」から送れます。" : "まだお店からの相談はありません。"}
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {list.map((i) => (
        <li key={i.id}>
          <Link href={`/inquiries/${i.id}`} className={`card flex flex-col gap-1 p-4 hover:ring-2 hover:ring-sprout ${i.unread ? "border-2 border-amber-300" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              {i.unread && (
                <span className="badge bg-amber-100 px-3 py-1 text-sm text-amber-950">{user.role === "FARMER" ? "● 返信が必要" : "● 新着あり"}</span>
              )}
              {i.status === "CLOSED" && <span className="badge bg-gray-100 px-3 py-1 text-sm text-gray-800">終えた相談</span>}
              <span className="font-bold">
                {itemEmoji(i.itemName)} {i.itemName}
              </span>
              <span>{user.role === "FARMER" ? `🏮 ${i.counterpart}` : `👩‍🌾 ${i.counterpart}`}</span>
              <span className="ml-auto text-sm">{formatJst(i.lastAt)}</span>
            </div>
            <p className="line-clamp-2 text-gray-800">
              {i.lastFromMe ? "あなた：" : ""}
              {i.lastBody}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
