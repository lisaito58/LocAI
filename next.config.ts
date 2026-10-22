import type { NextConfig } from "next";

// セキュリティ用のレスポンスヘッダー（画面の見た目・動作は変えない）
// - nosniff：ファイルの種類をブラウザに推測させない
// - Referrer-Policy：他のサイトへ移動するとき、ページのURLの詳細を渡さない
// - X-Frame-Options：他のサイトの iframe に埋め込ませない（このアプリは iframe で使っていない）
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 応答に「Next.js で動いている」と名乗るヘッダーを付けない
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    // 画像の最適化は、実際に使っているキャラクター画像だけに限る（外部の画像・SVG は扱わない）
    localPatterns: [{ pathname: "/characters/**" }],
  },
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // 出品写真のアップロード用（ブラウザで縮小してから送る。Vercel の上限 4.5MB 未満）
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
