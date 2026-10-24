// スクリプト用：.env.local を読み込む（値は表示しない）。他の import より先に読み込むこと
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

// デモ用・テスト用アカウントのパスワード（DEMO_PASSWORD）を読む。初期値は持たない。
// 未設定・短すぎる場合は、DB に接続する前にここで止める（DB は本番しかないため）。値は表示しない。
export function requireDemoPassword(): string {
  const value = process.env.DEMO_PASSWORD ?? "";
  if (!value) {
    console.error("DEMO_PASSWORD が設定されていません。.env.local に DEMO_PASSWORD=（デモ用アカウントのパスワード）を入れてから、もう一度実行してください。DB には何も書き込んでいません。");
    process.exit(1);
  }
  if (value.length < 8 || value.length > 128) {
    console.error("DEMO_PASSWORD は8〜128文字にしてください（画面からログインできる長さ）。DB には何も書き込んでいません。");
    process.exit(1);
  }
  return value;
}
