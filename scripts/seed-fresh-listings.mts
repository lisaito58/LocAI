// テスト用農家（test-farmer*@locai.example）に、受付中の架空の出品を追加する
// 実行：npm run seed:listings
// 既存の出品・注文は変更しない（追加だけ）。説明に「テストデータ」と入れて実データと区別する。
// 受付期限は実行時点から4日後。期限が過ぎたら、もう一度実行すると新しく追加される。
import "./load-env";
import { dbNow } from "../src/lib/domain/tx";
import { prisma } from "../src/lib/prisma";
import { createSeedListing, type ListingSeed } from "./seed-lib";

const plan: Record<string, ListingSeed[]> = {
  "test-farmer1@locai.example": [
    { itemName: "賀茂茄子", description: "在庫多め。複数店舗からの申込の確認用。", sizeLabel: "大きめ", price: 900, totalKg: 30, minKg: 1, stepKg: 0.5, graceHours: 24, saleTargetHours: 40 },
    { itemName: "万願寺唐辛子", description: "宅配と引き取りの両方を選べます。", sizeLabel: "混在", price: 1500, totalKg: 8, minKg: 0.5, stepKg: 0.5, graceHours: 24, pickup: true },
  ],
  "test-farmer2@locai.example": [
    { itemName: "九条ねぎ", description: "1kg単位。", price: 650, totalKg: 20, minKg: 1, stepKg: 1, graceHours: 24 },
    { itemName: "聖護院かぶ", description: "最低2kgから（「希望より多い候補」の確認用）。", price: 500, totalKg: 12, minKg: 2, stepKg: 1, graceHours: 24 },
  ],
  "test-farmer3@locai.example": [
    { itemName: "トマト", description: "前払い（銀行振込）。", sizeLabel: "中くらい", price: 600, totalKg: 15, minKg: 1, stepKg: 1, graceHours: 24, saleTargetHours: 70 },
    { itemName: "きゅうり", description: "宅配でも受け渡し時払い。", price: 450, totalKg: 10, minKg: 1, stepKg: 1, graceHours: 12, onHandoverShipping: true },
  ],
  "test-farmer4@locai.example": [
    { itemName: "黒枝豆", description: "回答猶予48時間（期限の確認用）。", price: 1800, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 48 },
    { itemName: "賀茂茄子", description: "残り2kgだけ（同時申込・売り切れの確認用）。", price: 850, totalKg: 2, minKg: 1, stepKg: 1, graceHours: 24 },
  ],
};

const now = await dbNow(prisma);
let n = 0;
for (const [email, listings] of Object.entries(plan)) {
  if (!email.startsWith("test-") || !email.endsWith("@locai.example")) continue;
  const farmer = await prisma.farmerProfile.findFirst({ where: { user: { email } } });
  if (!farmer) {
    console.log(`- ${email} がないので追加しません（先に npm run seed:test）`);
    continue;
  }
  for (const l of listings) {
    await createSeedListing(farmer.id, l, "テストデータ", now);
    n++;
  }
  console.log(`+ ${farmer.farmName}：出品${listings.length}件を追加`);
}
console.log(`\n完了：受付中の出品を ${n} 件追加しました（既存のデータは変更していません）`);
process.exit(0);
