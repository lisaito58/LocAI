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
    trialDailyLimit?: number;
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
    saleTargetHours?: number; // 早めに販売したい：いまから何時間後を販売希望期限にするか
    acceptHours?: number; // 受付期限：いまから何時間後か（省略時は4日後）
    responseHours?: number; // 回答の最終期限：いまから何時間後か（省略時は受付期限の24時間後）
    trial?: { setKg: number; priceYen: number; count: number }; // お試し販売（任意）
    feeYen?: [number, number, number, number]; // 送料（2kg以下／5kg以下／10kg以下／30kg以下）。省略時は800/1000/1300/1800円
    ratePrefectures?: string[]; // 送料を登録する府県。省略時は大阪府・京都府
  }[];
};

export type ListingSeed = FarmerSeed["listings"][number];

export type RestaurantSeed = {
  email: string;
  name: string;
  // null にすると店舗情報が未登録のアカウントになる（初回登録の流れを試す用）
  profile: { shopName: string; prefecture: string; city: string } | null;
};

// 送料表は大阪府・京都府だけ登録する（兵庫県などは「送料未設定」になる）
const SHIPPING_BANDS = (pref: string, fee: [number, number, number, number] = [800, 1000, 1300, 1800]) => [
  { prefecture: pref, minGramsExclusive: 0, maxGramsInclusive: 2000, feeYen: fee[0] },
  { prefecture: pref, minGramsExclusive: 2000, maxGramsInclusive: 5000, feeYen: fee[1] },
  { prefecture: pref, minGramsExclusive: 5000, maxGramsInclusive: 10000, feeYen: fee[2] },
  { prefecture: pref, minGramsExclusive: 10000, maxGramsInclusive: 30000, feeYen: fee[3] },
];

export async function seedAccounts(opts: {
  password: string;
  dataLabel: string; // 説明文の末尾に付ける目印（例：デモデータ）
  farmers: FarmerSeed[];
  restaurants: RestaurantSeed[];
}) {
  const now = await dbNow(prisma);
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
      await createSeedListing(farmer.id, l, opts.dataLabel, now);
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

// 出品を1件作る（省略時：受付期限は4日後、回答の最終期限は5日後、日程は6・7・9日後）
// 期限の順番は「受付期限 < 回答の最終期限 < 最初の受け渡し日」を守る
export async function createSeedListing(farmerId: string, l: ListingSeed, dataLabel: string, now: Date) {
  const h = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
  const acceptH = l.acceptHours ?? 24 * 4;
  const responseH = l.responseHours ?? acceptH + 24;
  if (!(acceptH < responseH) || l.graceHours > responseH) throw new Error(`${l.itemName}：期限の設定が正しくありません`);
  if (l.saleTargetHours && !(l.saleTargetHours > l.graceHours && l.saleTargetHours <= responseH)) throw new Error(`${l.itemName}：販売希望期限が正しくありません`);
  const firstDay = Math.ceil(responseH / 24) + 1; // 回答の最終期限の翌日以降
  // 受け渡し日時は、その日の日本時間のきりのよい時刻（宅配10時・引き取り12時）にそろえる
  const jstAt = (days: number, hour: number) => {
    const d = new Date(now.getTime() + days * 86_400_000 + 9 * 3_600_000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - 9));
  };
  const listing = await prisma.listing.create({
    data: {
      farmerId,
      status: "PUBLISHED",
      itemName: l.itemName,
      description: `${l.description}（${dataLabel}：実物写真なし）`,
      selfDeclaredFeatures: l.selfDeclaredFeatures ?? null,
      sizeLabel: l.sizeLabel ?? null,
      unitPriceYenPerKg: l.price,
      totalGrams: Math.round(l.totalKg * 1000),
      minOrderGrams: Math.round(l.minKg * 1000),
      orderStepGrams: Math.round(l.stepKg * 1000),
      responseGraceMinutes: l.graceHours * 60,
      acceptDeadlineAt: h(acceptH),
      responseDeadlineAt: h(responseH),
      earlySale: Boolean(l.saleTargetHours),
      saleTargetAt: l.saleTargetHours ? h(l.saleTargetHours) : null,
      publishedAt: now,
      ...(l.trial && { trialEnabled: true, trialSetGrams: Math.round(l.trial.setKg * 1000), trialSetPriceYen: l.trial.priceYen, trialSetCount: l.trial.count }),
    },
  });
  const shipping = await prisma.deliveryOption.create({
    data: {
      listingId: listing.id,
      method: "SHIPPING",
      paymentTiming: l.onHandoverShipping ? "ON_HANDOVER" : "PREPAID",
      paymentMethod: l.onHandoverShipping ? "CASH" : "BANK_TRANSFER",
      prepayDeadlineAt: l.onHandoverShipping ? null : h(responseH + 6),
      paymentConfirmGuideHours: 24,
      shippingRates: { create: (l.ratePrefectures ?? ["大阪府", "京都府"]).flatMap((p) => SHIPPING_BANDS(p, l.feeYen)) },
    },
  });
  await prisma.scheduleSlot.createMany({
    data: [0, 1, 3].map((d) => ({ listingId: listing.id, deliveryOptionId: shipping.id, startsAt: jstAt(firstDay + d, 10) })),
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
          create: (l.ratePrefectures ?? ["大阪府", "京都府"]).map((p) => ({ prefecture: p, minGramsExclusive: 0, maxGramsInclusive: 1_000_000, feeYen: 0 })),
        },
      },
    });
    await prisma.scheduleSlot.createMany({
      data: [0, 2].map((d) => ({ listingId: listing.id, deliveryOptionId: pickup.id, startsAt: jstAt(firstDay + d, 12), capacity: 3 })),
    });
  }
}
