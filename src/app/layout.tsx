import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Zen_Maru_Gothic } from "next/font/google";
import Script from "next/script";
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
  description: "地産地消・必要量でつながる野菜仕入れアプリ。関西の農家と飲食店をつなぎます。",
};

export const viewport: Viewport = {
  themeColor: "#2f7d4f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${maru.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        {/* 文字サイズ「大きめ」の設定を、最初の表示の前に反映する（保存先はこのブラウザ） */}
        <Script id="text-size" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("locai-pref:text-size")==="large")document.documentElement.dataset.text="large"}catch(e){}`}
        </Script>
        <Suspense fallback={<HeaderShell />}>
          <SiteHeader />
        </Suspense>
        <div className="flex flex-1 flex-col pb-12">{children}</div>
      </body>
    </html>
  );
}

function HeaderShell() {
  return <div className="h-16 border-b border-green-100 bg-white/80" />;
}
