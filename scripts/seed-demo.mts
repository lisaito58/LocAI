// デモデータの投入（すべて架空の人物・店・農園）
// 実行：npm run seed:demo
// すでに同じメールのデモアカウントがあれば作り直さない。パスワードは DEMO_PASSWORD（未設定なら下の初期値）。
import "./load-env";
import { hashPassword } from "better-auth/crypto";
import { dbNow } from "../src/lib/domain/tx";
import { prisma } from "../src/lib/prisma";

const PASSWORD = process.env.DEMO_PASSWORD || "locai-demo-2026";
const now = await dbNow(prisma);
const h = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

type FarmerSeed = {
  email: string;
  name: string;
  joinedDaysAgo: number;
  profile: { farmName: string; prefecture: string; city: string; mainItems: string; commitment: string; introduction: string; responseGuide: string; availableWeekdays: string };
  listings: {
    itemName: string;
    description: string;
    selfDeclaredFeatures?: string;
    sizeLabel?: string;
    price: number;
    totalKg: number;
    minKg: number;
    stepKg: number;
    graceHours: number;
    pickup?: boolean;
  }[];
};

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
      city: "能勢町",
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

const restaurants = [
  { email: "demo-shop1@locai.example", name: "デモ店主 三浦", shopName: "小料理 みかん（デモ）", prefecture: "大阪府", city: "大阪市福島区" },
  { email: "demo-shop2@locai.example", name: "デモ店主 北村", shopName: "ビストロ はたけ（デモ）", prefecture: "京都府", city: "京都市中京区" },
];

async function createAccount(email: string, name: string, role: "FARMER" | "RESTAURANT", createdAt = now) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return null;
  const id = crypto.randomUUID();
  await prisma.user.create({ data: { id, email, name, role, emailVerified: false, createdAt } });
  await prisma.account.create({
    data: { id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(PASSWORD) },
  });
  return id;
}

const SHIPPING_BANDS = (pref: string) => [
  { prefecture: pref, minGramsExclusive: 0, maxGramsInclusive: 2000, feeYen: 800 },
  { prefecture: pref, minGramsExclusive: 2000, maxGramsInclusive: 5000, feeYen: 1000 },
  { prefecture: pref, minGramsExclusive: 5000, maxGramsInclusive: 10000, feeYen: 1300 },
  { prefecture: pref, minGramsExclusive: 10000, maxGramsInclusive: 30000, feeYen: 1800 },
];

let created = 0;
for (const f of farmers) {
  const userId = await createAccount(f.email, f.name, "FARMER", new Date(now.getTime() - f.joinedDaysAgo * 86_400_000));
  if (!userId) {
    console.log(`- ${f.email} はすでにあるので作りません`);
    continue;
  }
  const farmer = await prisma.farmerProfile.create({
    data: { userId, ...f.profile, addressLine: "（架空の住所）1-2-3", contactPhone: "000-0000-0000", paymentConfirmGuideHours: 24 },
  });
  for (const l of f.listings) {
    const listing = await prisma.listing.create({
      data: {
        farmerId: farmer.id,
        status: "PUBLISHED",
        itemName: l.itemName,
        description: `${l.description}（デモデータ：実物写真なし）`,
        selfDeclaredFeatures: l.selfDeclaredFeatures ?? null,
        sizeLabel: l.sizeLabel ?? null,
        unitPriceYenPerKg: l.price,
        totalGrams: l.totalKg * 1000,
        minOrderGrams: l.minKg * 1000,
        orderStepGrams: l.stepKg * 1000,
        responseGraceMinutes: l.graceHours * 60,
        acceptDeadlineAt: h(24 * 4),
        responseDeadlineAt: h(24 * 5),
        publishedAt: now,
      },
    });
    const shipping = await prisma.deliveryOption.create({
      data: {
        listingId: listing.id,
        method: "SHIPPING",
        paymentTiming: "PREPAID",
        paymentMethod: "BANK_TRANSFER",
        prepayDeadlineAt: h(24 * 5 + 6),
        paymentConfirmGuideHours: 24,
        shippingRates: { create: [...SHIPPING_BANDS("大阪府"), ...SHIPPING_BANDS("京都府")] },
      },
    });
    await prisma.scheduleSlot.createMany({
      data: [6, 7, 9].map((d) => ({ listingId: listing.id, deliveryOptionId: shipping.id, startsAt: h(24 * d) })),
    });
    if (l.pickup) {
      const pickup = await prisma.deliveryOption.create({
        data: {
          listingId: listing.id,
          method: "PICKUP",
          paymentTiming: "ON_HANDOVER",
          paymentMethod: "CASH",
          paymentConfirmGuideHours: 24,
          shippingRates: {
            create: ["大阪府", "京都府"].map((p) => ({ prefecture: p, minGramsExclusive: 0, maxGramsInclusive: 1_000_000, feeYen: 0 })),
          },
        },
      });
      await prisma.scheduleSlot.createMany({
        data: [6, 8].map((d) => ({ listingId: listing.id, deliveryOptionId: pickup.id, startsAt: h(24 * d + 2), capacity: 3 })),
      });
    }
    created++;
  }
  console.log(`+ ${f.profile.farmName}（${f.email}）と出品${f.listings.length}件`);
}

for (const r of restaurants) {
  const userId = await createAccount(r.email, r.name, "RESTAURANT");
  if (!userId) {
    console.log(`- ${r.email} はすでにあるので作りません`);
    continue;
  }
  await prisma.restaurantProfile.create({
    data: { userId, shopName: r.shopName, prefecture: r.prefecture, city: r.city, addressLine: "（架空の住所）4-5-6", contactPhone: "000-0000-0000" },
  });
  console.log(`+ ${r.shopName}（${r.email}）`);
}

console.log(`\n完了：出品 ${created} 件を作成しました。デモアカウントのパスワードは DEMO_PASSWORD（未設定なら初期値）です。`);
process.exit(0);
