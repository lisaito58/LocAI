// 出品の作成・公開・編集・受付終了・再公開
// 再公開は同じ出品IDで行い、総量を最初の値に戻さない。既存注文は申込時のスナップショットを使う。
import { checkSaleTarget, isServicePrefecture, SERVICE_AREA_LABEL, SERVICE_PREFECTURES, type ListingInput } from "@/lib/validation/listing";
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
    return { errors, options: [] as CheckedOption[], accept: now, response: now, saleTargetAt: null };
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

    // 引き取りは送料0円。どの地域のお店も申し込めるよう、全都道府県を0円で登録する（入力は求めない）
    const rates =
      o.method === "PICKUP"
        ? SERVICE_PREFECTURES.map((prefecture) => ({ prefecture, minGramsExclusive: 0, maxGramsInclusive: LIMITS.maxQuantityGrams, feeYen: 0 }))
        : o.rates.map((r) => ({
            prefecture: r.prefecture,
            minGramsExclusive: r.minKg,
            maxGramsInclusive: r.maxKg,
            feeYen: r.feeYen,
          }));
    for (const e of validateShippingBands(rates)) errors.push(`${label}：${e}`);
    if (o.method !== "PICKUP" && rates.length === 0) errors.push(`${label}：送料（無料の場合は0円）を1行以上登録してください`);

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

  const sale = checkSaleTarget(
    { earlySale: input.earlySale ?? false, saleTargetAt: input.saleTargetAt },
    { now, responseGraceMinutes: input.responseGraceHours * 60, responseDeadlineAt: response },
    jstLocalToDate,
  );
  errors.push(...sale.errors);

  return { errors, options, accept, response, saleTargetAt: sale.saleTargetAt };
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
    // 産地も対象地域（関西2府4県）に限る
    if (!isServicePrefecture(farmer.prefecture)) fail(`農園の所在地を${SERVICE_AREA_LABEL}に設定してから出品してください`);
    const now = await dbNow(tx);
    const { errors, options, accept, response, saleTargetAt } = checkListingInput(input.data, now);
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
        earlySale: Boolean(saleTargetAt),
        saleTargetAt,
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
    const { errors, options, accept, response, saleTargetAt } = checkListingInput(input.data, now);
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
        earlySale: Boolean(saleTargetAt),
        saleTargetAt,
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
    sizeLabel?: string | null;
    earlySale?: boolean;
    saleTargetAt?: string;
  },
): Promise<Result> {
  return runTx(db, async (tx) => {
    const { listing, now } = await loadOwnListing(tx, input.listingId, input.farmerUserId);
    const committed = listing.soldGrams + listing.heldGrams;
    if (input.totalGrams < committed) {
      fail(`出品総量は、販売確定量と仮押さえ量の合計（${committed / 1000}kg）未満にできません`);
    }
    if (input.totalGrams > LIMITS.maxQuantityGrams) fail("出品総量は1,000kg以下にしてください");
    const sale = checkSaleTarget(
      { earlySale: input.earlySale ?? false, saleTargetAt: input.saleTargetAt },
      { now, responseGraceMinutes: listing.responseGraceMinutes, responseDeadlineAt: listing.responseDeadlineAt },
      jstLocalToDate,
    );
    if (sale.errors.length) fail(sale.errors.join("\n"));
    await tx.listing.update({
      where: { id: listing.id },
      data: {
        unitPriceYenPerKg: input.unitPriceYenPerKg,
        totalGrams: input.totalGrams,
        description: input.description ?? null,
        selfDeclaredFeatures: input.selfDeclaredFeatures ?? null,
        conditionNote: input.conditionNote ?? null,
        ...(input.sizeLabel !== undefined && { sizeLabel: input.sizeLabel || null }),
        // 値下げしなくても「早めに販売したい」にできる。既存注文の条件は変えない
        ...(input.earlySale !== undefined && { earlySale: Boolean(sale.saleTargetAt), saleTargetAt: sale.saleTargetAt }),
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

// 送料表の編集（受け渡し方法ごとに置き換える）。帯の重なり・抜け・開始位置を検証する。
// 既存の購入希望・確定注文は申込時の送料表を保存しているので、この変更の影響を受けない。
export async function updateShippingRates(
  db: Db,
  input: {
    farmerUserId: string;
    listingId: string;
    deliveryOptionId: string;
    rates: { prefecture: string; minGramsExclusive: number; maxGramsInclusive: number; feeYen: number }[];
  },
): Promise<Result<{ count: number }>> {
  return runTx(db, async (tx) => {
    const { listing } = await loadOwnListing(tx, input.listingId, input.farmerUserId);
    const option = await tx.deliveryOption.findUnique({ where: { id: input.deliveryOptionId } });
    if (!option || option.listingId !== listing.id || !option.active) fail("受け渡し方法が見つかりません");
    if (option.method === "PICKUP") fail("引き取りの送料は0円で固定です");
    if (input.rates.length === 0) fail("送料（無料の場合は0円）を1行以上登録してください");
    for (const r of input.rates) {
      if (!isServicePrefecture(r.prefecture)) fail(`送料の地域は${SERVICE_AREA_LABEL}から選んでください`);
      if (r.maxGramsInclusive > LIMITS.maxQuantityGrams) fail("重量帯の上限は1,000kgまでにしてください");
    }
    const errors = validateShippingBands(input.rates);
    if (errors.length) fail(errors.join("\n"));
    await tx.shippingRate.deleteMany({ where: { deliveryOptionId: option.id } });
    await tx.shippingRate.createMany({ data: input.rates.map((r) => ({ ...r, deliveryOptionId: option.id })) });
    return { count: input.rates.length };
  });
}

// お試し販売の設定（任意）。在庫は通常販売と共通で、設定してもアプリ用の在庫は増えない。
export async function updateTrialSettings(
  db: Db,
  input: { farmerUserId: string; listingId: string; enabled: boolean; setGrams?: number; priceYen?: number; count?: number },
): Promise<Result> {
  return runTx(db, async (tx) => {
    const { listing } = await loadOwnListing(tx, input.listingId, input.farmerUserId);
    if (!input.enabled) {
      await tx.listing.update({ where: { id: listing.id }, data: { trialEnabled: false } });
      return {};
    }
    const { setGrams, priceYen, count } = input;
    if (!setGrams || setGrams < LIMITS.minQuantityGrams) fail("1セットの数量は0.5kg以上にしてください");
    if (setGrams > listing.totalGrams) fail("1セットの数量が出品総量を超えています");
    if (!priceYen || priceYen < 1 || priceYen > LIMITS.maxYen) fail("1セットの価格を1〜100,000円で入力してください");
    if (count === undefined || count < 0 || count > 999) fail("用意するセット数を0〜999で入力してください");
    const used = await tx.order.count({
      where: { listingId: listing.id, isTrial: true, status: { in: ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT", "CONFIRMED"] } },
    });
    if (count < used) fail(`すでに申込中・確定のお試しが${used}セットあるため、それより少なくはできません`);
    await tx.listing.update({
      where: { id: listing.id },
      data: { trialEnabled: true, trialSetGrams: setGrams, trialSetPriceYen: priceYen, trialSetCount: count },
    });
    return {};
  });
}
