import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Zen_Maru_Gothic } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const maru = Zen_Maru_Gothic({
  variable: "--font-maru",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "LocAI｜地元の野菜を、必要な量で",
  description: "地産地消・必要量でつながる野菜仕入れアプリ。農家と飲食店をつなぎます。",
};

export const viewport: Viewport = {
  themeColor: "#2f7d4f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${maru.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<HeaderShell />}>
          <SiteHeader />
        </Suspense>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="mt-12 border-t border-green-100 bg-white/70 py-6 text-center text-xs text-green-900/60">
          <p>🌱 LocAI — 地産地消・必要量でつながる野菜仕入れ 🧺</p>
          <p className="mt-1">アプリ内での決済・配送手配は行いません。デモは架空のデータです。</p>
        </footer>
      </body>
    </html>
  );
}

function HeaderShell() {
  return <div className="h-16 border-b border-green-100 bg-white/80" />;
}
