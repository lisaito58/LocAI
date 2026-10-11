import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "新規登録 | LocAI" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="card flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-leaf-dark"><span aria-hidden>🌱</span>新規登録</h1>
      <Suspense>
        <SignUpForm />
      </Suspense>
      <p className="text-sm">
        登録済みの方は <Link href="/login" className="link">ログイン</Link>
      </p>
      </div>
    </main>
  );
}
