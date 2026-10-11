import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン | LocAI" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="card flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-leaf-dark"><span aria-hidden>🧺</span>ログイン</h1>
      <LoginForm />
      <p className="text-sm">
        はじめての方は <Link href="/signup" className="link">新規登録</Link>
      </p>
      </div>
    </main>
  );
}
