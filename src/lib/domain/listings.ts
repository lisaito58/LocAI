// 出品の作成・公開・編集・受付終了・再公開
// 再公開は同じ出品IDで行い、総量を最初の値に戻さない。既存注文は申込時のスナップショットを使う。
import type { ListingInput } from "@/lib/validation/listing";
import { validateShippingBands } from "./shipping";
import { expireDueOrdersInListing } from "./orders";
import { dbNow, fail, lockListing, runTx, type Db, type Result, type Tx } from "./tx";
import { jstLocalToDate, LIMITS, textToDateOnly } from "./units";

export type PhotoUpload = { bytes: Uint8Array<ArrayBuffer>; contentType: string };

type CheckedOption = {
  method: ListingInput["deliveryOptions"][number]["method"];
  paymentTiming: ListingInput["deliveryOptions"][number]["paymentTiming"];
  paymentMethod: ListingInput["deliveryOptions"][number]["paymentMethod"];
  prepayDeadlineAt: Date | null;
  paymentConfirmGuideHours: number;
  rates: { prefecture: string; minGramsExclusive: number; maxGramsInclusive: number; feeYen: number }[];
  slots: { startsAt: Date; endsAt: Date | null; capacity: number | null }[];
};

// 期限・数量・送料表・日程の整合性を確認する（公開・再公開の両方で使う）
export function checkListingInput(input: ListingInput, now: Date) {
  const errors: string[] = [];
  const { totalKg: total, minKg: min, stepKg: step } = input;
  if (total < LIMITS.minQuantityGrams || total > LIMITS.maxQuantityGrams) errors.push("出品総量は0.5〜1,000kgにしてください");
  if (min < LIMITS.minQuantityGrams || min > LIMITS.maxQuantityGrams) errors.push("最低量は0.5〜1,000kgにしてください");
  if (step < 1 || step > LIMITS.maxQuantityGrams) errors.push("注文単位は0.001〜1,000kgにしてください");
  if (min > total) errors.push("最低量は出品総量以下にしてください");

  const accept = jstLocalToDate(input.acceptDeadlineAt);
  const response = jstLocalToDate(input.responseDeadlineAt);
  if (!accept || !response) {
    errors.push("期限の日時が正しくありません");
    return { errors, options: [] as CheckedOption[], accept: now, response: now };
  }
  if (accept <= now) errors.push("受付期限は現在より後にしてください");
  if (accept >= response) errors.push("受付期限は回答の最終期限より前にしてください");

  const options: CheckedOption[] = input.deliveryOptions.map((o, i) => {
    const label = `受け渡し方法${i + 1}`;
    const slots = o.slots.map((s) => ({
      startsAt: jstLocalToDate(s.startsAt),
      endsAt: s.endsAt ? jstLocalToDate(s.endsAt) : null,
      capacity: s.capacity === "" || s.capacity === undefined ? null : s.capacity,
    }));
    for (const s of slots) {
      if (!s.startsAt) errors.push(`${label}：受け渡し日時が正しくありません`);
      else if (s.startsAt <= response) errors.push(`${label}：受け渡し日時は回答の最終期限より後にしてください`);
      if (s.endsAt && s.startsAt && s.endsAt <= s.startsAt) errors.push(`${label}：終了時刻は開始より後にしてください`);
    }
    const firstSlot = slots
      .map((s) => s.startsAt)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    let prepay: Date | null = null;
    if (o.paymentTiming === "PREPAID") {
      prepay = o.prepayDeadlineAt ? jstLocalToDate(o.prepayDeadlineAt) : null;
      if (!prepay) errors.push(`${label}：前払いの支払期限を入力してください`);
      else {
        if (prepay <= response) errors.push(`${label}：前払いの支払期限は回答の最終期限より後にしてください`);
        if (firstSlot && prepay >= firstSlot) errors.push(`${label}：前払いの支払期限は最初の受け渡しより前にしてください`);
      }
    }

    const rates = o.rates.map((r) => ({
      prefecture: r.prefecture,
      minGramsExclusive: r.minKg,
      maxGramsInclusive: r.maxKg,
      feeYen: r.feeYen,
    }));
    for (const e of validateShippingBands(rates)) errors.push(`${label}：${e}`);
    if (o.method === "PICKUP" && rates.some((r) => r.feeYen !== 0)) errors.push(`${label}：引き取りの送料は0円にしてください`);

    return {
      method: o.method,
      paymentTiming: o.paymentTiming,
      paymentMethod: o.paymentMethod,
      prepayDeadlineAt: prepay,
      paymentConfirmGuideHours: o.paymentConfirmGuideHours,
      rates,
      slots: slots.filter((s): s is { startsAt: Date; endsAt: Date | null; capacity: number | null } => Boolean(s.startsAt)),
    };
  });
  const methods = options.map((o) => o.method);
  if (new Set(methods).size !== methods.length) errors.push("同じ受け渡し方法は1つにまとめてください");

  return { errors, options, accept, response };
}

async function createOptions(tx: Tx, listingId: string, options: CheckedOption[]) {
  for (const o of options) {
    const created = await tx.deliveryOption.create({
      data: {
        listingId,
        method: o.method,
        paymentTiming: o.paymentTiming,
        paymentMethod: o.paymentMethod,
        prepayDeadlineAt: o.prepayDeadlineAt,
        paymentConfirmGuideHours: o.paymentConfirmGuideHours,
        shippingRates: { create: o.rates },
      },
    });
    await tx.scheduleSlot.createMany({ data: o.slots.map((s) => ({ ...s, listingId, deliveryOptionId: created.id })) });
  }
}

async function savePhoto(tx: Tx, listingId: string, round: number, input: ListingInput, photo: PhotoUpload) {
  const id = crypto.randomUUID();
  await tx.listingPhoto.create({
    data: {
      id,
      listingId,
      publishRound: round,
      url: `/api/photos/${id}`,
      storageKey: `db:${id}`,
      takenOn: textToDateOnly(input.photoTakenOn),
      selfTakenConfirmed: input.photoSelfTaken,
      blob: { create: { contentType: photo.contentType, data: photo.bytes } },
    },
  });
}

export async function createListing(
  db: Db,
  input: { farmerUserId: string; data: ListingInput; photo: PhotoUpload; copiedFromListingId?: string },
): Promise<Result<{ listingId: string }>> {
  return runTx(db, async (tx) => {
    const farmer = await tx.farmerProfile.findUnique({ where: { userId: input.farmerUserId } });
    if (!farmer) fail("先に農園プロフィールを登録してください");
    const now = await dbNow(tx);
    const { errors, options, accept, response } = checkListingInput(input.data, now);
    if (errors.length) fail(errors.join("\n"));

    let copiedFrom: string | null = null;
    if (input.copiedFromListingId) {
      const src = await tx.listing.findUnique({ where: { id: input.copiedFromListingId } });
      if (src?.farmerId === farmer.id) copiedFrom = src.id;
    }
    const d = input.data;
    const listing = await tx.listing.create({
      data: {
        farmerId: farmer.id,
        status: "PUBLISHED",
        itemName: d.itemName,
        description: d.description ?? null,
        selfDeclaredFeatures: d.selfDeclaredFeatures ?? null,
        sizeLabel: d.sizeLabel || null,
        conditionNote: d.conditionNote ?? null,
        unitPriceYenPerKg: d.unitPriceYenPerKg,
        totalGrams: d.totalKg,
        minOrderGrams: d.minKg,
        orderStepGrams: d.stepKg,
        responseGraceMinutes: d.responseGraceHours * 60,
        acceptDeadlineAt: accept,
        responseDeadlineAt: response,
        copiedFromListingId: copiedFrom,
        publishedAt: now,
      },
    });
    await createOptions(tx, listing.id, options);
    await savePhoto(tx, listing.id, 1, d, input.photo);
    return { listingId: listing.id };
  });
}

async function loadOwnListing(tx: Tx, listingId: string, farmerUserId: string) {
  await lockListing(tx, listingId);
  const listing = await tx.listing.findUnique({ where: { id: listingId }, include: { farmer: true } });
  if (!listing || listing.farmer.userId !== farmerUserId) fail("出品が見つかりません");
  const now = await dbNow(tx);
  await expireDueOrdersInListing(tx, listingId, now);
  const fresh = await tx.listing.findUniqueOrThrow({ where: { id: listingId } });
  return { listing: fresh, now };
}

// 再公開：受付終了・受付期限後に、同じ出品IDで残量の受付を再開する
// 販売可能量は現在の残り以下だけ（総量を最初の値に戻さない）。新しい実物写真が必要。
export async function republishListing(
  db: Db,
  input: { farmerUserId: string; listingId: string; data: ListingInput; photo: PhotoUpload },
): Promise<Result> {
  return runTx(db, async (tx) => {
    const { listing, now } = await loadOwnListing(tx, input.listingId, input.farmerUserId);
    if (listing.status === "PUBLISHED" && listing.acceptDeadlineAt > now) {
      fail("受付中の出品は再公開できません。受付終了してから再公開してください");
    }
    const { errors, options, accept, response } = checkListingInput(input.data, now);
    const committed = listing.soldGrams + listing.heldGrams;
    const currentAvailable = listing.totalGrams - committed;
    const newAvailable = input.data.totalKg; // 再公開フォームの「販売可能量」
    if (newAvailable > currentAvailable) {
      errors.push(`販売可能量は現在の残り（${currentAvailable / 1000}kg）以下にしてください。増やす場合は新しく出品してください`);
    }
    if (newAvailable < input.data.minKg) errors.push("販売可能量が最低量より少ないため再公開できません");
    if (errors.length) fail(errors.join("\n"));

    const round = listing.publishRound + 1;
    const d = input.data;
    await tx.listing.update({
      where: { id: listing.id },
      data: {
        status: "PUBLISHED",
        totalGrams: committed + newAvailable,
        publishRound: round,
        itemName: d.itemName,
        description: d.description ?? null,
        selfDeclaredFeatures: d.selfDeclaredFeatures ?? null,
        sizeLabel: d.sizeLabel || null,
        conditionNote: d.conditionNote ?? null,
        unitPriceYenPerKg: d.unitPriceYenPerKg,
        minOrderGrams: d.minKg,
        orderStepGrams: d.stepKg,
        responseGraceMinutes: d.responseGraceHours * 60,
        acceptDeadlineAt: accept,
        responseDeadlineAt: response,
        publishedAt: now,
      },
    });
    // 以前の受け渡し条件は既存注文が参照するので消さずに無効化する
    await tx.deliveryOption.updateMany({ where: { listingId: listing.id }, data: { active: false } });
    await createOptions(tx, listing.id, options);
    await savePhoto(tx, listing.id, round, d, input.photo);
    return {};
  });
}

// 公開中の編集（単価・説明・総量）。総量は「確定量＋仮押さえ量」未満にできない
export async function updateListing(
  db: Db,
  input: {
    farmerUserId: string;
    listingId: string;
    unitPriceYenPerKg: number;
    totalGrams: number;
    description?: string;
    selfDeclaredFeatures?: string;
    conditionNote?: string;
  },
): Promise<Result> {
  return runTx(db, async (tx) => {
    const { listing } = await loadOwnListing(tx, input.listingId, input.farmerUserId);
    const committed = listing.soldGrams + listing.heldGrams;
    if (input.totalGrams < committed) {
      fail(`出品総量は、販売確定量と仮押さえ量の合計（${committed / 1000}kg）未満にできません`);
    }
    if (input.totalGrams > LIMITS.maxQuantityGrams) fail("出品総量は1,000kg以下にしてください");
    await tx.listing.update({
      where: { id: listing.id },
      data: {
        unitPriceYenPerKg: input.unitPriceYenPerKg,
        totalGrams: input.totalGrams,
        description: input.description ?? null,
        selfDeclaredFeatures: input.selfDeclaredFeatures ?? null,
        conditionNote: input.conditionNote ?? null,
      },
    });
    return {};
  });
}

// 受付終了（新規申込だけを止める。既存注文は自分の注文期限まで有効）
export async function closeListing(db: Db, input: { farmerUserId: string; listingId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    const { listing } = await loadOwnListing(tx, input.listingId, input.farmerUserId);
    if (listing.status !== "PUBLISHED") return {};
    await tx.listing.update({ where: { id: listing.id }, data: { status: "CLOSED" } });
    return {};
  });
}
