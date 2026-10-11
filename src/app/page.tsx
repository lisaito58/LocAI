import { Suspense } from "react";
import Link from "next/link";
import { signOut } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/validation/auth";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">LocAI</h1>
      <p className="text-center">地産地消・必要量でつながる野菜仕入れアプリ（準備中）</p>
      {/* ログイン状態は見る人ごとに変わるので、あとから差し込む */}
      <Suspense fallback={<p className="text-gray-600">読み込み中…</p>}>
        <AccountStatus />
      </Suspense>
    </main>
  );
}

async function AccountStatus() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex gap-4">
        <Link href="/login" className="rounded bg-green-700 px-4 py-2 font-medium text-white">
          ログイン
        </Link>
        <Link href="/signup" className="rounded border border-green-700 px-4 py-2 font-medium text-green-800">
          新規登録
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p>
        {user.name} さん（{ROLE_LABELS[user.role]}）でログイン中
      </p>
      <form action={signOut}>
        <button type="submit" className="rounded border border-gray-500 px-4 py-2">
          ログアウト
        </button>
      </form>
    </div>
  );
}
