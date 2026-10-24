// デモデータの投入（すべて架空の人物・店・農園）
// 実行：npm run seed:demo
// すでに同じメールのデモアカウントがあれば作り直さない。パスワードは環境変数 DEMO_PASSWORD（必須。未設定なら DB に触れる前に止まる）。
import { requireDemoPassword } from "./load-env";
import { seedAccounts, type FarmerSeed, type RestaurantSeed } from "./seed-lib";

const PASSWORD = requireDemoPassword();

const farmers: FarmerSeed[] = [
  {
    email: "demo-farmer1@locai.example",
    name: "デモ農家 坂本",
    joinedDaysAgo: 120,
    profile: {
      farmName: "みどり農園（デモ）",
      prefecture: "京都府",
      city: "南丹市",
      mainItems: "賀茂茄子、万願寺唐辛子",
      commitment: "朝5時に収穫し、その日のうちに箱詰めしています",
      introduction: "京都府南丹市で京野菜を育てています。朝どれの賀茂茄子と万願寺唐辛子を、必要な量だけお届けします。（架空の農園です）",
      responseGuide: "当日の夕方までに返信します",
      availableWeekdays: "月・火・水・木・金",
    },
    listings: [
      { itemName: "賀茂茄子", description: "丸くて肉厚。田楽や揚げびたしに。", selfDeclaredFeatures: "皮がやわらかめ", sizeLabel: "大きめ", price: 900, totalKg: 30, minKg: 1, stepKg: 0.5, graceHours: 24 },
      { itemName: "万願寺唐辛子", description: "辛みが少なく甘い京野菜。焼き浸しに。", sizeLabel: "混在", price: 1600, totalKg: 8, minKg: 0.5, stepKg: 0.5, graceHours: 24 },
    ],
  },
  {
    email: "demo-farmer2@locai.example",
    name: "デモ農家 中川",
    joinedDaysAgo: 5,
    profile: {
      farmName: "さくら畑（デモ）",
      prefecture: "京都府",
      city: "亀岡市",
      mainItems: "九条ねぎ、賀茂茄子",
      commitment: "化学肥料を減らした土づくり（自己申告）",
      introduction: "今年から直接販売を始めた小さな畑です。（架空の農園です）",
      responseGuide: "翌朝までに返信します",
      availableWeekdays: "火・木・土",
    },
    listings: [
      { itemName: "九条ねぎ", description: "青い部分がやわらかく、薬味にも鍋にも。", price: 700, totalKg: 20, minKg: 1, stepKg: 1, graceHours: 24 },
      { itemName: "賀茂茄子", description: "形は不揃いですが味は自慢です。", sizeLabel: "混在", price: 750, totalKg: 12, minKg: 2, stepKg: 1, graceHours: 12, pickup: true },
    ],
  },
  {
    email: "demo-farmer3@locai.example",
    name: "デモ農家 山口",
    joinedDaysAgo: 60,
    profile: {
      farmName: "ひだまりファーム（デモ）",
      prefecture: "大阪府",
      city: "豊能郡能勢町",
      mainItems: "トマト、万願寺唐辛子",
      commitment: "完熟してから収穫します",
      introduction: "大阪の北の山あいで野菜を育てています。（架空の農園です）",
      responseGuide: "半日以内に返信します",
      availableWeekdays: "月・水・金・土",
    },
    listings: [
      { itemName: "トマト", description: "完熟で収穫。サラダやソースに。", sizeLabel: "中くらい", price: 600, totalKg: 15, minKg: 1, stepKg: 1, graceHours: 24 },
      { itemName: "万願寺唐辛子", description: "大阪生まれの万願寺です。", price: 1450, totalKg: 6, minKg: 1, stepKg: 0.5, graceHours: 24 },
    ],
  },
];

const restaurants: RestaurantSeed[] = [
  { email: "demo-shop1@locai.example", name: "デモ店主 三浦", profile: { shopName: "小料理 みかん（デモ）", prefecture: "大阪府", city: "大阪市福島区" } },
  { email: "demo-shop2@locai.example", name: "デモ店主 北村", profile: { shopName: "ビストロ はたけ（デモ）", prefecture: "京都府", city: "京都市中京区" } },
];

const { listingCount } = await seedAccounts({ password: PASSWORD, dataLabel: "デモデータ", farmers, restaurants });
console.log(`\n完了：出品 ${listingCount} 件を作成しました。デモアカウントのパスワードは DEMO_PASSWORD に設定した値です。`);
process.exit(0);
