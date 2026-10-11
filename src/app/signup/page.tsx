import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "新規登録 | LocAI" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">新規登録</h1>
      <SignUpForm />
      <p className="text-sm">
        登録済みの方は <Link href="/login" className="text-green-800 underline">ログイン</Link>
      </p>
    </main>
  );
}
