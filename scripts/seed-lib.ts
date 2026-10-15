// デモ・テスト用アカウントの投入で共通に使う処理（すべて架空のデータ）
// すでに同じメールのアカウントがあれば作り直さない。
import { hashPassword } from "better-auth/crypto";
import { dbNow } from "../src/lib/domain/tx";
import { prisma } from "../src/lib/prisma";

export type FarmerSeed = {
  email: string;
  name: string;
  joinedDaysAgo: number;
  profile: {
    farmName: string;
    prefecture: string;
    city: string;
    mainItems: string;
    commitment: string;
    introduction: string;
    responseGuide: string;
    availableWeekdays: string;
  };
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
    pickup?: boolean; // 引き取り（受け渡し時払い・0円・件数上限あり）も用意する
    onHandoverShipping?: boolean; // 宅配を前払いでなく受け渡し時払いにする
  }[];
};

export type RestaurantSeed = {
  email: string;
  name: string;
  // null にすると店舗情報が未登録のアカウントになる（初回登録の流れを試す用）
  profile: { shopName: string; prefecture: string; city: string } | null;
};

// 送料表は大阪府・京都府だけ登録する（兵庫県などは「送料未設定」になる）
const SHIPPING_BANDS = (pref: string) => [
  { prefecture: pref, minGramsExclusive: 0, maxGramsInclusive: 2000, feeYen: 800 },
  { prefecture: pref, minGramsExclusive: 2000, maxGramsInclusive: 5000, feeYen: 1000 },
  { prefecture: pref, minGramsExclusive: 5000, maxGramsInclusive: 10000, feeYen: 1300 },
  { prefecture: pref, minGramsExclusive: 10000, maxGramsInclusive: 30000, feeYen: 1800 },
];

export async function seedAccounts(opts: {
  password: string;
  dataLabel: string; // 説明文の末尾に付ける目印（例：デモデータ）
  farmers: FarmerSeed[];
  restaurants: RestaurantSeed[];
}) {
  const now = await dbNow(prisma);
  const h = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
  const passwordHash = await hashPassword(opts.password);

  async function createAccount(email: string, name: string, role: "FARMER" | "RESTAURANT", createdAt = now) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return null;
    const id = crypto.randomUUID();
    await prisma.user.create({ data: { id, email, name, role, emailVerified: false, createdAt } });
    await prisma.account.create({
      data: { id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash },
    });
    return id;
  }

  let listingCount = 0;
  for (const f of opts.farmers) {
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
          description: `${l.description}（${opts.dataLabel}：実物写真なし）`,
          selfDeclaredFeatures: l.selfDeclaredFeatures ?? null,
          sizeLabel: l.sizeLabel ?? null,
          unitPriceYenPerKg: l.price,
          totalGrams: Math.round(l.totalKg * 1000),
          minOrderGrams: Math.round(l.minKg * 1000),
          orderStepGrams: Math.round(l.stepKg * 1000),
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
          paymentTiming: l.onHandoverShipping ? "ON_HANDOVER" : "PREPAID",
          paymentMethod: l.onHandoverShipping ? "CASH" : "BANK_TRANSFER",
          prepayDeadlineAt: l.onHandoverShipping ? null : h(24 * 5 + 6),
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
      listingCount++;
    }
    console.log(`+ ${f.profile.farmName}（${f.email}）と出品${f.listings.length}件`);
  }

  for (const r of opts.restaurants) {
    const userId = await createAccount(r.email, r.name, "RESTAURANT");
    if (!userId) {
      console.log(`- ${r.email} はすでにあるので作りません`);
      continue;
    }
    if (r.profile) {
      await prisma.restaurantProfile.create({
        data: { userId, ...r.profile, addressLine: "（架空の住所）4-5-6", contactPhone: "000-0000-0000" },
      });
    }
    console.log(`+ ${r.profile?.shopName ?? "（店舗情報なし）"}（${r.email}）`);
  }
  return { listingCount };
}
