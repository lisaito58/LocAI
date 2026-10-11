// Prisma CLI（マイグレーション等）の設定
// 手元では .env.local から読み込む。Vercel では画面で登録した環境変数が使われる。
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // マイグレーションは接続プーリングを通さない直接接続を使う
    url: env("DATABASE_URL_UNPOOLED"),
  },
});
