import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン | LocAI" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <LoginForm />
      <p className="text-sm">
        はじめての方は <Link href="/signup" className="text-green-800 underline">新規登録</Link>
      </p>
    </main>
  );
}
