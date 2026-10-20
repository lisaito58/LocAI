// 注文・在庫ルールの結合テスト（実際のDBで、架空のテスト用データだけを使う）
// 実行：npm run test:integration
// このテストが作ったデータ（メールが it-<実行ID>-...@example.invalid）だけを、最後に削除する。
import "./load-env";
import assert from "node:assert/strict";
import { closeListing, createListing, republishListing, updateListing, updateShippingRates, updateTrialSettings } from "../src/lib/domain/listings";
import * as orders from "../src/lib/domain/orders";
import * as records from "../src/lib/domain/records";
import * as loss from "../src/lib/domain/loss";
import * as reviews from "../src/lib/domain/reviews";
import { searchListings } from "../src/lib/domain/search";
import { getFarmerTodo, getShopTodo } from "../src/lib/domain/todo";
import { dbNow } from "../src/lib/domain/tx";
import { dateToJstDateText, dateToJstLocal } from "../src/lib/domain/units";
import type { ListingInput } from "../src/lib/validation/listing";
import { prisma } from "../src/lib/prisma";

const RUN = `it-${Date.now().toString(36)}`;
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${e instanceof Error ? e.message : e}`);
  }
}

// ---- テスト用の架空データ ----
async function makeUser(role: "FARMER" | "RESTAURANT", key: string, prefecture: string) {
  const id = `${RUN}-${key}`;
  await prisma.user.create({ data: { id, name: `テスト${key}`, email: `${id}@example.invalid`, role } });
  if (role === "FARMER") {
    await prisma.farmerProfile.create({
      data: { userId: id, farmName: `テスト農園${key}`, prefecture, city: "南丹市", addressLine: "架空1-1", contactPhone: "000-0000-0000" },
    });
  } else {
    await prisma.restaurantProfile.create({
      data: { userId: id, shopName: `テスト食堂${key}`, prefecture, city: "大阪市", addressLine: "架空2-2", contactPhone: "000-0000-0000" },
    });
  }
  return id;
}

const now0 = await dbNow(prisma);
const at = (hours: number) => dateToJstLocal(new Date(now0.getTime() + hours * 3_600_000));
const useDate = dateToJstDateText(new Date(now0.getTime() + 5 * 86_400_000));
const confirmBy = new Date(now0.getTime() + 40 * 3_600_000);
const PHOTO = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), contentType: "image/jpeg" };

function listingInput(o: { totalKg: number; minKg: number; stepKg: number; price: number; method?: "SHIPPING" | "PICKUP"; capacity?: number }): ListingInput {
  const method = o.method ?? "SHIPPING";
  return {
    itemName: "テスト茄子",
    description: undefined,
    selfDeclaredFeatures: undefined,
    conditionNote: undefined,
    earlySale: false,
    unitPriceYenPerKg: o.price,
    totalKg: o.totalKg,
    minKg: o.minKg,
    stepKg: o.stepKg,
    responseGraceHours: 24,
    acceptDeadlineAt: at(20),
    responseDeadlineAt: at(48),
    photoTakenOn: useDate,
    photoSelfTaken: true as const,
    sizeLabel: "" as const,
    deliveryOptions: [
      {
        method,
        paymentTiming: "PREPAID" as const,
        paymentMethod: "BANK_TRANSFER" as const,
        prepayDeadlineAt: at(60),
        paymentConfirmGuideHours: 24,
        rates:
          method === "PICKUP"
            ? [{ prefecture: "大阪府" as const, minKg: 0, maxKg: 1_000_000, feeYen: 0 }]
            : [
                { prefecture: "大阪府" as const, minKg: 0, maxKg: 2000, feeYen: 800 },
                { prefecture: "大阪府" as const, minKg: 2000, maxKg: 5000, feeYen: 1000 },
                { prefecture: "大阪府" as const, minKg: 5000, maxKg: 10000, feeYen: 1300 },
              ],
        slots: [
          { startsAt: at(72), capacity: o.capacity ?? ("" as const) },
          { startsAt: at(96), capacity: "" as const },
        ],
      },
    ],
  };
}

async function newListing(farmer: string, o: Parameters<typeof listingInput>[0]) {
  const r = await createListing(prisma, { farmerUserId: farmer, data: listingInput(o), photo: PHOTO });
  if (!r.ok) throw new Error(r.error);
  return r.listingId;
}

async function order(restaurant: string, listingId: string, kg: number, extra: Partial<Parameters<typeof orders.createOrder>[1]> = {}) {
  const opt = await prisma.deliveryOption.findFirstOrThrow({ where: { listingId, active: true }, include: { scheduleSlots: { orderBy: { startsAt: "asc" } } } });
  return orders.createOrder(prisma, {
    restaurantUserId: restaurant,
    listingId,
    deliveryOptionId: opt.id,
    scheduleSlotId: opt.scheduleSlots[0].id,
    quantityGrams: Math.round(kg * 1000),
    budgetYen: 100_000,
    useDate,
    purchaseConfirmByAt: confirmBy,
    idempotencyKey: crypto.randomUUID(),
    ...extra,
  });
}

function okId(r: Awaited<ReturnType<typeof order>>) {
  if (!r.ok) throw new Error(r.error);
  return r.orderId;
}

async function stock(listingId: string) {
  const l = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  return { total: l.totalGrams, sold: l.soldGrams, held: l.heldGrams, available: l.totalGrams - l.soldGrams - l.heldGrams };
}

// 不変条件：出品の確定量・仮押さえ量が、注文の合計と一致し、総量を超えない
async function assertInvariant(listingId: string) {
  const s = await stock(listingId);
  const os = await prisma.order.findMany({ where: { listingId } });
  const held = os.filter((o) => ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT"].includes(o.status)).reduce((a, o) => a + o.heldGrams, 0);
  const sold = os.filter((o) => o.status === "CONFIRMED").reduce((a, o) => a + o.quantityGrams, 0);
  assert.equal(s.held, held, `仮押さえ量が注文と一致しない（出品${s.held}g / 注文${held}g）`);
  assert.equal(s.sold, sold, `確定量が注文と一致しない（出品${s.sold}g / 注文${sold}g）`);
  assert.ok(s.sold + s.held <= s.total, "売り越し");
  for (const o of os) if (!["AWAITING_RESPONSE", "AWAITING_REAGREEMENT"].includes(o.status)) assert.equal(o.heldGrams, 0);
}

try {
  const F = await makeUser("FARMER", "f1", "京都府");
  const F2 = await makeUser("FARMER", "f2", "京都府");
  const R1 = await makeUser("RESTAURANT", "r1", "大阪府");
  const R2 = await makeUser("RESTAURANT", "r2", "大阪府");
  const R3 = await makeUser("RESTAURANT", "r3", "大阪府");
  const RH = await makeUser("RESTAURANT", "rh", "兵庫県");

  await check("1. 複数店舗が異なる数量で申し込み、全量未達でも注文ごとに承認できる", async () => {
    const L = await newListing(F, { totalKg: 10000, minKg: 1000, stepKg: 500, price: 900 });
    const o1 = okId(await order(R1, L, 2));
    const o2 = okId(await order(R2, L, 3.5));
    okId(await order(R3, L, 1));
    assert.deepEqual(await stock(L), { total: 10000, sold: 0, held: 6500, available: 3500 });
    assert.ok((await orders.approveOrder(prisma, { orderId: o1, farmerUserId: F })).ok);
    assert.ok((await orders.approveOrder(prisma, { orderId: o2, farmerUserId: F })).ok);
    assert.deepEqual(await stock(L), { total: 10000, sold: 5500, held: 1000, available: 3500 });
    const a = await prisma.order.findUniqueOrThrow({ where: { id: o1 } });
    assert.equal(a.totalYen, 1800 + 800); // 2kgちょうどは800円帯
    const b = await prisma.order.findUniqueOrThrow({ where: { id: o2 } });
    assert.equal(b.totalYen, 3150 + 1000);
    await assertInvariant(L);
  });

  await check("2. 残り1kgへの同時申込で売り越さない／連打は1件にまとまる", async () => {
    const L = await newListing(F, { totalKg: 1000, minKg: 1000, stepKg: 1000, price: 500 });
    const rs = await Promise.all([order(R1, L, 1), order(R2, L, 1), order(R3, L, 1)]);
    assert.equal(rs.filter((r) => r.ok).length, 1, "成功は1件だけのはず");
    assert.deepEqual(await stock(L), { total: 1000, sold: 0, held: 1000, available: 0 });
    await assertInvariant(L);

    const L2 = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const key = crypto.randomUUID();
    const dup = await Promise.all([1, 2, 3].map(() => order(R1, L2, 1, { idempotencyKey: key })));
    assert.ok(dup.every((r) => r.ok));
    const ids = new Set(dup.map((r) => (r.ok ? r.orderId : "")));
    assert.equal(ids.size, 1, "同じキーの申込は1件の注文");
    assert.equal(await prisma.order.count({ where: { listingId: L2 } }), 1);
    assert.equal((await stock(L2)).held, 1000, "仮押さえも1件分だけ");
  });

  await check("3a. 取消と承認の競合：先に成功した操作だけが反映され、残量が一致する", async () => {
    const L = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    for (let i = 0; i < 3; i++) {
      const o = okId(await order(R1, L, 1));
      const [c, a] = await Promise.all([
        orders.cancelOrder(prisma, { orderId: o, restaurantUserId: R1 }),
        orders.approveOrder(prisma, { orderId: o, farmerUserId: F }),
      ]);
      assert.equal(Number(c.ok) + Number(a.ok), 1, "どちらか一方だけ成功");
      const st = (await prisma.order.findUniqueOrThrow({ where: { id: o } })).status;
      assert.equal(st, c.ok ? "CANCELLED" : "CONFIRMED");
      if (!a.ok) assert.match(a.error, /取消/);
    }
    await assertInvariant(L);
  });

  await check("3b. 期限切れと承認の競合／期限ちょうどは期限切れ", async () => {
    const L = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const o = okId(await order(R1, L, 1));
    await prisma.$executeRaw`UPDATE "Order" SET "deadlineAt" = clock_timestamp() - interval '1 second' WHERE id = ${o}`;
    const [a] = await Promise.all([
      orders.approveOrder(prisma, { orderId: o, farmerUserId: F }),
      orders.expireDueOrders(prisma, { listingIds: [L] }),
    ]);
    assert.ok(!a.ok, "期限後の承認は失敗");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o } })).status, "EXPIRED");

    const o2 = okId(await order(R1, L, 1));
    await prisma.$executeRaw`UPDATE "Order" SET "deadlineAt" = clock_timestamp() WHERE id = ${o2}`;
    const a2 = await orders.approveOrder(prisma, { orderId: o2, farmerUserId: F });
    assert.ok(!a2.ok, "期限ちょうど（以上）では承認できない");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o2 } })).status, "EXPIRED");
    assert.equal((await stock(L)).held, 0, "期限切れで仮押さえ解除");
    await assertInvariant(L);
  });

  await check("4. 数量減少で差分を即時解除し、送料帯・総額を再計算。再同意・見送り・期限切れで正しい数量", async () => {
    const L = await newListing(F, { totalKg: 10000, minKg: 1000, stepKg: 500, price: 900 });
    const slot2 = (await prisma.scheduleSlot.findMany({ where: { listingId: L }, orderBy: { startsAt: "asc" } }))[1];
    // 再同意
    const o = okId(await order(R1, L, 3.5));
    const p = await orders.proposeChange(prisma, { orderId: o, farmerUserId: F, newQuantityGrams: 2000, newScheduleSlotId: slot2.id });
    assert.ok(p.ok, p.ok ? "" : p.error);
    assert.equal((await stock(L)).held, 2000, "減らした1.5kgはすぐ解除");
    const prop = await prisma.orderChangeProposal.findUniqueOrThrow({ where: { orderId: o } });
    assert.equal(prop.newShippingFeeYen, 800, "2kgなので800円帯");
    assert.equal(prop.newTotalYen, 1800 + 800);
    const again = await orders.proposeChange(prisma, { orderId: o, farmerUserId: F, newQuantityGrams: 1000, newScheduleSlotId: slot2.id });
    assert.ok(!again.ok, "変更案は1回だけ");
    assert.ok((await orders.reagreeOrder(prisma, { orderId: o, restaurantUserId: R1 })).ok);
    const done = await prisma.order.findUniqueOrThrow({ where: { id: o } });
    assert.equal(done.quantityGrams, 2000);
    assert.equal(done.totalYen, 2600);
    assert.equal(done.scheduleSlotId, slot2.id);
    assert.deepEqual(await stock(L), { total: 10000, sold: 2000, held: 0, available: 8000 });

    // 増量はできない
    const ox = okId(await order(R2, L, 1));
    assert.ok(!(await orders.proposeChange(prisma, { orderId: ox, farmerUserId: F, newQuantityGrams: 1500, newScheduleSlotId: slot2.id })).ok);
    // 変更後に見送り
    const o2 = okId(await order(R2, L, 3));
    assert.ok((await orders.proposeChange(prisma, { orderId: o2, farmerUserId: F, newQuantityGrams: 2000, newScheduleSlotId: slot2.id })).ok);
    assert.ok((await orders.declineOrder(prisma, { orderId: o2, farmerUserId: F })).ok);
    // 変更後に期限切れ
    const o3 = okId(await order(R3, L, 3));
    assert.ok((await orders.proposeChange(prisma, { orderId: o3, farmerUserId: F, newQuantityGrams: 1500, newScheduleSlotId: slot2.id })).ok);
    await prisma.$executeRaw`UPDATE "Order" SET "deadlineAt" = clock_timestamp() - interval '1 second' WHERE id = ${o3}`;
    assert.ok(!(await orders.reagreeOrder(prisma, { orderId: o3, restaurantUserId: R3 })).ok, "期限後は再同意できない");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o3 } })).status, "EXPIRED");
    // 枠の数（移動先の枠）が戻っていること
    const s2 = await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: slot2.id } });
    assert.equal(s2.usedCount, 1, "確定した1件だけが枠を使う");
    await assertInvariant(L);
  });

  await check("5. 送料境界（2kgちょうど／2kg超）、無料送料、送料未設定、単価の円未満切り捨て", async () => {
    const L = await newListing(F, { totalKg: 10000, minKg: 1000, stepKg: 1, price: 333 });
    const a = await prisma.order.findUniqueOrThrow({ where: { id: okId(await order(R1, L, 2)) } });
    assert.equal(a.itemSubtotalYen, 666);
    assert.equal(a.shippingFeeYen, 800);
    const b = await prisma.order.findUniqueOrThrow({ where: { id: okId(await order(R1, L, 2.001)) } });
    assert.equal(b.itemSubtotalYen, 666, "666.333円 → 666円");
    assert.equal(b.shippingFeeYen, 1000, "2kg超は次の帯");
    const free = await newListing(F, { totalKg: 10000, minKg: 1000, stepKg: 1000, price: 500, method: "PICKUP" });
    const c = await prisma.order.findUniqueOrThrow({ where: { id: okId(await order(R1, free, 3)) } });
    assert.equal(c.shippingFeeYen, 0);
    assert.equal(c.totalYen, 1500);
    const unset = await order(RH, L, 1);
    assert.ok(!unset.ok && /送料が未設定/.test(unset.error), "兵庫県は送料未設定で申込不可");
    assert.equal((await stock(L)).held, 2000 + 2001, "未設定の申込は仮押さえしない");
    const notAllowed = await order(R1, (await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 500, price: 500 })), 1.2);
    assert.ok(!notAllowed.ok, "単位に合わない数量は拒否");
  });

  await check("6. 出品編集・再公開で在庫をリセットせず、既存注文の条件を上書きしない", async () => {
    const L = await newListing(F, { totalKg: 10000, minKg: 1000, stepKg: 1000, price: 900 });
    const o1 = okId(await order(R1, L, 3));
    assert.ok((await orders.approveOrder(prisma, { orderId: o1, farmerUserId: F })).ok);
    okId(await order(R2, L, 2));
    const low = await updateListing(prisma, { farmerUserId: F, listingId: L, unitPriceYenPerKg: 500, totalGrams: 4000 });
    assert.ok(!low.ok, "確定3kg＋仮押さえ2kg＝5kg 未満にはできない");
    assert.ok((await updateListing(prisma, { farmerUserId: F, listingId: L, unitPriceYenPerKg: 500, totalGrams: 8000 })).ok);
    const kept = await prisma.order.findUniqueOrThrow({ where: { id: o1 } });
    assert.equal(kept.snapUnitPriceYenPerKg, 900, "既存注文の単価は申込時のまま");
    assert.equal(kept.totalYen, 2700 + 1000);

    assert.ok((await closeListing(prisma, { farmerUserId: F, listingId: L })).ok);
    const tooMuch = await republishListing(prisma, { farmerUserId: F, listingId: L, data: { ...listingInput({ totalKg: 9000, minKg: 1000, stepKg: 1000, price: 600 }) }, photo: PHOTO });
    assert.ok(!tooMuch.ok, "現在の残り（3kg）より多くは再公開できない");
    const re = await republishListing(prisma, { farmerUserId: F, listingId: L, data: { ...listingInput({ totalKg: 2000, minKg: 1000, stepKg: 1000, price: 600 }) }, photo: PHOTO });
    assert.ok(re.ok, re.ok ? "" : re.error);
    const s = await stock(L);
    assert.deepEqual(s, { total: 3000 + 2000 + 2000, sold: 3000, held: 2000, available: 2000 }, "最初の10kgには戻らない");
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: L } });
    assert.equal(l.publishRound, 2);
    assert.equal(await prisma.listingPhoto.count({ where: { listingId: L, publishRound: 2 } }), 1, "再公開用の新しい写真");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o1 } })).snapUnitPriceYenPerKg, 900);
    await assertInvariant(L);
  });

  await check("7. 予備相談は在庫を押さえず、第一候補が回答待ち・確定の間は予備注文へ進めない", async () => {
    const L1 = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const L2 = await newListing(F2, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const primary = okId(await order(R1, L1, 2));
    const inq = await records.openInquiry(prisma, { listingId: L2, restaurantUserId: R1, primaryOrderId: primary, body: "予備で2kgお願いできますか" });
    assert.ok(inq.ok);
    assert.equal((await stock(L2)).held, 0, "相談では仮押さえしない");
    const blocked = await order(R1, L2, 2, { inquiryId: inq.ok ? inq.inquiryId : "" });
    assert.ok(!blocked.ok && /回答待ち/.test(blocked.error));
    assert.ok((await orders.approveOrder(prisma, { orderId: primary, farmerUserId: F })).ok);
    const blocked2 = await order(R1, L2, 2, { inquiryId: inq.ok ? inq.inquiryId : "" });
    assert.ok(!blocked2.ok && /販売確定/.test(blocked2.error), "第一候補が確定済みなら進めない");

    const p2 = okId(await order(R2, L1, 1));
    const inq2 = await records.openInquiry(prisma, { listingId: L2, restaurantUserId: R2, primaryOrderId: p2, body: "予備" });
    assert.ok(inq2.ok);
    assert.ok((await orders.cancelOrder(prisma, { orderId: p2, restaurantUserId: R2 })).ok);
    const go = await order(R2, L2, 1, { inquiryId: inq2.ok ? inq2.inquiryId : "" });
    assert.ok(go.ok, go.ok ? "" : go.error);
    const conv = await prisma.listingInquiry.findUniqueOrThrow({ where: { id: inq2.ok ? inq2.inquiryId : "" } });
    assert.equal(conv.status, "CONVERTED");
  });

  await check("8. 他人のIDを指定しても閲覧・変更できない", async () => {
    const L = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const o = okId(await order(R1, L, 1));
    assert.ok(!(await orders.cancelOrder(prisma, { orderId: o, restaurantUserId: R2 })).ok, "他店は取消できない");
    assert.ok(!(await orders.approveOrder(prisma, { orderId: o, farmerUserId: F2 })).ok, "他の農家は承認できない");
    assert.ok(!(await orders.approveOrder(prisma, { orderId: o, farmerUserId: R1 })).ok, "店は承認できない");
    assert.ok(!(await records.postOrderMessage(prisma, { orderId: o, userId: R2, body: "のぞき見" })).ok, "他店は相談に書けない");
    assert.ok(!(await updateListing(prisma, { farmerUserId: F2, listingId: L, unitPriceYenPerKg: 1, totalGrams: 5000 })).ok, "他の農家は出品を編集できない");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o } })).status, "AWAITING_RESPONSE");
  });

  await check("9. 支払申告と入金確認は別。申告の連打で予定は延びず、自動確認されない。前払い未確認の発送は警告", async () => {
    const L = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const o = okId(await order(R1, L, 1));
    assert.ok(!(await records.reportPayment(prisma, { orderId: o, userId: R1 })).ok, "確定前は記録できない");
    assert.ok((await orders.approveOrder(prisma, { orderId: o, farmerUserId: F })).ok);
    const sent = await records.markSent(prisma, { orderId: o, userId: F });
    assert.ok(!sent.ok && /入金確認/.test(sent.error), "前払い・入金未確認の発送は再確認が必要");
    assert.ok((await records.reportPayment(prisma, { orderId: o, userId: R1 })).ok);
    const first = (await prisma.paymentRecord.findUniqueOrThrow({ where: { orderId: o } })).firstReportedAt;
    await new Promise((r) => setTimeout(r, 50));
    assert.ok((await records.reportPayment(prisma, { orderId: o, userId: R1 })).ok);
    const pay = await prisma.paymentRecord.findUniqueOrThrow({ where: { orderId: o } });
    assert.equal(pay.status, "BUYER_REPORTED", "店の申告だけでは確認済みにならない");
    assert.equal(pay.firstReportedAt?.getTime(), first?.getTime(), "確認予定の起点は最初の申告のまま");
    assert.ok(!(await records.confirmPayment(prisma, { orderId: o, userId: R1 })).ok, "店は入金確認できない");
    assert.ok((await records.confirmPayment(prisma, { orderId: o, userId: F })).ok);
    assert.ok((await records.markSent(prisma, { orderId: o, userId: F })).ok);
    assert.ok((await records.markReceived(prisma, { orderId: o, userId: R1 })).ok);
    const fix = await records.correctRecord(prisma, { orderId: o, userId: F, target: "sent", reason: "記録の押し間違い" });
    assert.ok(fix.ok);
    assert.equal(await prisma.recordCorrection.count({ where: { orderId: o } }), 1, "訂正の履歴が残る");
    assert.ok(!(await records.correctRecord(prisma, { orderId: o, userId: F, target: "received", reason: "x" })).ok, "他人の記録は訂正できない");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o } })).status, "CONFIRMED", "注文状態は戻らない");
  });

  await check("検索：通常候補・追加量候補・送料未設定の振り分け、AIなしで動く", async () => {
    const L = await newListing(F, { totalKg: 10000, minKg: 1500, stepKg: 500, price: 400 });
    const base = {
      itemQuery: "テスト茄子",
      itemMode: "EXACT" as const,
      budgetYen: 100_000,
      useDate,
      deliveryMethod: "ANY" as const,
      purchaseConfirmByAt: confirmBy,
      showUnsetShipping: true,
      sort: "fair" as const,
      seed: "abc",
    };
    const r1 = await searchListings(prisma, R1, { ...base, quantityGrams: 1000, extraGrams: 0 });
    assert.ok(!r1.normal.some((c) => c.listingId === L), "最低1.5kgなので1kg希望の通常候補には出ない");
    const r2 = await searchListings(prisma, R1, { ...base, quantityGrams: 1000, extraGrams: 500 });
    const ex = r2.extra.find((c) => c.listingId === L);
    assert.ok(ex, "追加0.5kgまで許容すると別枠に出る");
    assert.equal(ex.purchaseGrams, 1500);
    const r3 = await searchListings(prisma, R1, { ...base, quantityGrams: 1500, extraGrams: 0 });
    assert.ok(r3.normal.some((c) => c.listingId === L));
    const r4 = await searchListings(prisma, RH, { ...base, quantityGrams: 1500, extraGrams: 0 });
    assert.ok(r4.unsetShipping.some((c) => c.listingId === L), "兵庫県は送料未設定の相談枠");
    assert.ok(!r4.normal.some((c) => c.listingId === L));
    const tight = await searchListings(prisma, R1, { ...base, quantityGrams: 1500, extraGrams: 0, purchaseConfirmByAt: new Date(now0.getTime() + 3_600_000) });
    assert.ok(!tight.normal.some((c) => c.listingId === L), "回答猶予24時間が確定希望時刻に収まらない出品は出ない");
  });

  await check("10. 条件なしの一覧：受付中の出品が最初から出る／未指定の条件は計算しない／予算は数量があるときだけ", async () => {
    const L = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 700 });
    const base = { itemQuery: "", itemMode: "ANY" as const, deliveryMethod: "ANY" as const, extraGrams: 0, showUnsetShipping: false, sort: "fair" as const, seed: "browse1" };
    const r = await searchListings(prisma, R1, base);
    const c = r.normal.find((x) => x.listingId === L);
    assert.ok(c, "条件なしでも一覧に出る");
    assert.equal(c.totalYen, null, "数量がないので合計は未計算");
    assert.equal(c.priced, false);
    assert.ok(r.openCount >= 1);
    const again = await searchListings(prisma, R1, base);
    assert.deepEqual(again.normal.map((x) => x.listingId), r.normal.map((x) => x.listingId), "同じシードなら同じ順番");
    const cheap = await searchListings(prisma, R1, { ...base, quantityGrams: 2000, budgetYen: 1000 });
    assert.ok(!cheap.normal.some((x) => x.listingId === L), "2kg×700円＋送料は予算1000円を超えるので出ない");
    // 売り切れると一覧から外れる
    okId(await order(R2, L, 5));
    const sold = await searchListings(prisma, R1, base);
    assert.ok(!sold.normal.some((x) => x.listingId === L), "申込可能量が0なら一覧に出ない");
  });

  await check("11. 販売希望期限：合意が間に合わない設定は理由つきで拒否、間に合う出品だけ紹介対象", async () => {
    const tooEarly = await createListing(prisma, { farmerUserId: F, data: { ...listingInput({ totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 }), earlySale: true, saleTargetAt: at(10) }, photo: PHOTO });
    assert.ok(!tooEarly.ok && /間に合いません/.test(tooEarly.error), "回答猶予24時間より前の期限は不可");
    const tooLate = await createListing(prisma, { farmerUserId: F, data: { ...listingInput({ totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 }), earlySale: true, saleTargetAt: at(50) }, photo: PHOTO });
    assert.ok(!tooLate.ok && /回答の最終期限/.test(tooLate.error), "回答の最終期限より後は不可");
    const missing = await createListing(prisma, { farmerUserId: F, data: { ...listingInput({ totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 }), earlySale: true }, photo: PHOTO });
    assert.ok(!missing.ok, "早めに販売したいなら期限が必須");
    const okL = await createListing(prisma, { farmerUserId: F, data: { ...listingInput({ totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 }), earlySale: true, saleTargetAt: at(30) }, photo: PHOTO });
    assert.ok(okL.ok, okL.ok ? "" : okL.error);
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: okL.ok ? okL.listingId : "" } });
    assert.equal(l.acceptDeadlineAt.getTime(), new Date(`${at(20)}:00+09:00`).getTime(), "受付期限は変わらない");
    const r = await searchListings(prisma, R1, { itemQuery: "", itemMode: "ANY", deliveryMethod: "ANY", extraGrams: 0, showUnsetShipping: false, sort: "saleTarget", seed: "s1" });
    const c = r.normal.find((x) => x.listingId === l.id);
    assert.ok(c?.saleTargetReachable, "合意が見込めるので紹介対象");
    assert.equal(r.normal[0].saleTargetReachable, true, "販売希望期限が近い順では対象が先頭");
    // 値下げなしで早めに販売を外す／価格を変えても既存注文は変わらない
    const o = okId(await order(R1, l.id, 1));
    assert.ok((await updateListing(prisma, { farmerUserId: F, listingId: l.id, unitPriceYenPerKg: 400, totalGrams: l.totalGrams, earlySale: false })).ok);
    const after = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(after.earlySale, false);
    assert.equal(after.unitPriceYenPerKg, 400);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o } })).snapUnitPriceYenPerKg, 500, "既存の購入希望は申込時の単価のまま");
  });

  await check("12. ホームの件数：再同意待ちは農家の回答待ちに含めない／取消・確定で減る", async () => {
    const L = await newListing(F2, { totalKg: 10000, minKg: 1000, stepKg: 1000, price: 500 });
    const fp = await prisma.farmerProfile.findUniqueOrThrow({ where: { userId: F2 } });
    const rp = await prisma.restaurantProfile.findUniqueOrThrow({ where: { userId: R3 } });
    const before = await getFarmerTodo(prisma, fp.id, new Date());
    const a = okId(await order(R3, L, 2));
    const b = okId(await order(R3, L, 2));
    const slot2 = (await prisma.scheduleSlot.findMany({ where: { listingId: L }, orderBy: { startsAt: "asc" } }))[1];
    assert.ok((await orders.proposeChange(prisma, { orderId: b, farmerUserId: F2, newQuantityGrams: 1000, newScheduleSlotId: slot2.id })).ok);
    const t1 = await getFarmerTodo(prisma, fp.id, new Date());
    assert.equal(t1.awaitingResponse, before.awaitingResponse + 1, "条件変更中の注文は回答待ちに数えない");
    assert.equal(t1.waitingShopReagreement, before.waitingShopReagreement + 1);
    assert.ok(t1.dueToday <= t1.awaitingResponse, "今日が期限は回答待ちの内数");
    const s1 = await getShopTodo(prisma, rp.id, new Date());
    assert.ok(s1.needsReagreement >= 1);
    assert.ok((await orders.cancelOrder(prisma, { orderId: a, restaurantUserId: R3 })).ok);
    const t2 = await getFarmerTodo(prisma, fp.id, new Date());
    assert.equal(t2.awaitingResponse, before.awaitingResponse, "取消すると減る");
    assert.ok((await orders.reagreeOrder(prisma, { orderId: b, restaurantUserId: R3 })).ok);
    const s2 = await getShopTodo(prisma, rp.id, new Date());
    assert.equal(s2.needsReagreement, s1.needsReagreement - 1);
    assert.equal(s2.paymentNeeded, s1.paymentNeeded + 1, "確定すると支払いが必要に入る");
  });

  await check("13. レビュー：受取後の店だけ・1注文1件（同時でも1件）・返信は本人だけ・通報で削除しない・連絡先は書けない", async () => {
    const L = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const o = okId(await order(R1, L, 1));
    assert.ok((await orders.approveOrder(prisma, { orderId: o, farmerUserId: F })).ok);
    const early = await reviews.postReview(prisma, { orderId: o, userId: R1, rating: "GOOD", tags: [] });
    assert.ok(!early.ok && /受け取り/.test(early.error), "受取前は投稿できない");
    assert.ok((await records.markReceived(prisma, { orderId: o, userId: R1 })).ok);
    assert.ok(!(await reviews.postReview(prisma, { orderId: o, userId: R2, rating: "GOOD", tags: [] })).ok, "他店は投稿できない");
    const phone = await reviews.postReview(prisma, { orderId: o, userId: R1, rating: "GOOD", tags: [], comment: "連絡は090-1234-5678まで" });
    assert.ok(!phone.ok && /電話番号/.test(phone.error), "電話番号は公開コメントに書けない");
    const both = await Promise.all([
      reviews.postReview(prisma, { orderId: o, userId: R1, rating: "GOOD", tags: ["説明どおりの野菜"], comment: "写真どおりでした" }),
      reviews.postReview(prisma, { orderId: o, userId: R1, rating: "CONCERN", tags: [] }),
    ]);
    assert.equal(both.filter((r) => r.ok).length, 1, "同時に送っても1件だけ");
    assert.equal(await prisma.review.count({ where: { orderId: o } }), 1);
    const rv = await prisma.review.findUniqueOrThrow({ where: { orderId: o } });
    assert.ok(!(await reviews.replyToReview(prisma, { reviewId: rv.id, userId: F2, body: "他人の返信" })).ok, "別の農家は返信できない");
    assert.ok(!(await reviews.replyToReview(prisma, { reviewId: rv.id, userId: R1, body: "店の返信" })).ok, "店は返信できない");
    assert.ok((await reviews.replyToReview(prisma, { reviewId: rv.id, userId: F, body: "ありがとうございました" })).ok);
    const rep1 = await reviews.reportReview(prisma, { reviewId: rv.id, userId: F, reason: "確認してほしい" });
    const rep2 = await reviews.reportReview(prisma, { reviewId: rv.id, userId: F, reason: "もう一度" });
    assert.ok(rep1.ok && !rep1.already && rep2.ok && rep2.already, "同じ人の通報は1件");
    assert.equal(await prisma.review.count({ where: { id: rv.id } }), 1, "通報しても削除されない");
    const fp = await prisma.farmerProfile.findUniqueOrThrow({ where: { userId: F } });
    const sum = await reviews.getFarmerReviews(prisma, fp.id);
    assert.ok(sum.total >= 1 && sum.recent[0].restaurant.shopName.startsWith("テスト食堂"));
    assert.ok(!("email" in sum.recent[0].restaurant), "メールアドレスは含めない");
    const fp2 = await prisma.farmerProfile.findUniqueOrThrow({ where: { userId: F2 } });
    assert.equal((await reviews.getFarmerReviews(prisma, fp2.id)).total, 0, "レビュー0件は0件として扱う（低評価ではない）");
  });

  await check("15. 販売確定後に住所を変えても、確定した注文の届け先は変わらない", async () => {
    const L = await newListing(F, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const o = okId(await order(R2, L, 1));
    assert.ok((await orders.approveOrder(prisma, { orderId: o, farmerUserId: F })).ok);
    const snap = await prisma.order.findUniqueOrThrow({ where: { id: o } });
    assert.match(snap.snapRestaurantAddress ?? "", /架空2-2/);
    await prisma.restaurantProfile.update({ where: { userId: R2 }, data: { addressLine: "引っ越し先9-9" } });
    const again = await prisma.order.findUniqueOrThrow({ where: { id: o } });
    assert.equal(again.snapRestaurantAddress, snap.snapRestaurantAddress, "注文の届け先はそのまま");
  });

  await check("16. ロス記録：本人だけ・受取後だけ・1注文1件（訂正・同時でも二重にならない）・使用中はロス0にしない", async () => {
    const L = await newListing(F, { totalKg: 10000, minKg: 1000, stepKg: 1000, price: 600 });
    const o = okId(await order(R1, L, 2));
    const notYet = await loss.saveLossRecord(prisma, { orderId: o, userId: R1, choice: { kind: "RATIO", quarters: 2 } });
    assert.ok(!notYet.ok, "確定・受取前は記録できない");
    assert.ok((await orders.approveOrder(prisma, { orderId: o, farmerUserId: F })).ok);
    assert.ok((await records.markReceived(prisma, { orderId: o, userId: R1 })).ok);
    assert.ok(!(await loss.saveLossRecord(prisma, { orderId: o, userId: R2, choice: { kind: "RATIO", quarters: 0 } })).ok, "他店は記録できない");
    assert.ok(!(await loss.saveLossRecord(prisma, { orderId: o, userId: F, choice: { kind: "RATIO", quarters: 0 } })).ok, "農家は記録できない");
    const half = await loss.saveLossRecord(prisma, { orderId: o, userId: R1, choice: { kind: "RATIO", quarters: 2 } });
    assert.ok(half.ok && half.wasteGrams === 1000, "受取量2kgの約半分＝1kg");
    const rec = await prisma.lossRecord.findUniqueOrThrow({ where: { orderId: o } });
    assert.equal(rec.approximate, true, "割合ボタンは概算");
    const over = await loss.saveLossRecord(prisma, { orderId: o, userId: R1, choice: { kind: "DIRECT", wasteKg: "2.5" } });
    assert.ok(!over.ok && /超えて/.test(over.error), "受取量を超える廃棄量は不可");
    await Promise.all([
      loss.saveLossRecord(prisma, { orderId: o, userId: R1, choice: { kind: "DIRECT", wasteKg: "0.3" } }),
      loss.saveLossRecord(prisma, { orderId: o, userId: R1, choice: { kind: "DIRECT", wasteKg: "0.3" } }),
    ]);
    assert.equal(await prisma.lossRecord.count({ where: { orderId: o } }), 1, "連打・訂正でも1注文1件");
    const fixed = await prisma.lossRecord.findUniqueOrThrow({ where: { orderId: o } });
    assert.equal(fixed.wasteGrams, 300);
    assert.equal(fixed.approximate, false, "直接入力は概算ではない");
    const ord = await prisma.order.findUniqueOrThrow({ where: { id: o } });
    assert.equal(ord.quantityGrams, 2000, "元の注文は書き換えない");
    // 実際の受取量の訂正（注文はそのまま）
    assert.ok((await loss.saveLossRecord(prisma, { orderId: o, userId: R1, choice: { kind: "IN_USE" }, receivedKg: "1.8" })).ok);
    const inUse = await prisma.lossRecord.findUniqueOrThrow({ where: { orderId: o } });
    assert.equal(inUse.status, "IN_USE");
    assert.equal(inUse.wasteGrams, null, "使用中は廃棄量なし（ロス0ではない）");
    assert.equal(inUse.receivedGrams, 1800);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o } })).quantityGrams, 2000);
  });

  await check("17. ロス集計：ロス率は合計÷合計、ロス額は商品代×割合（送料除く）、振り返りなしは「記録なし」、受取日が基準", async () => {
    const L = await newListing(F2, { totalKg: 20000, minKg: 1000, stepKg: 1000, price: 1000 });
    const rp = await prisma.restaurantProfile.findUniqueOrThrow({ where: { userId: R3 } });
    const mk = async (kg: number, receivedDaysAgo: number) => {
      const o = okId(await order(R3, L, kg));
      assert.ok((await orders.approveOrder(prisma, { orderId: o, farmerUserId: F2 })).ok);
      assert.ok((await records.markReceived(prisma, { orderId: o, userId: R3 })).ok);
      await prisma.fulfillmentRecord.update({ where: { orderId: o }, data: { buyerReceivedAt: new Date(Date.now() - receivedDaysAgo * 86_400_000) } });
      return o;
    };
    const from = new Date(Date.now() - 10 * 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const empty = await loss.getLossSummary(prisma, rp.id, from, to);
    assert.equal(empty.totals.lossRate, null, "振り返り済みがなければ0%ではなく記録なし");
    const a = await mk(1, 3); // 1kg中 1kg廃棄（100%）
    const b = await mk(4, 2); // 4kg中 1kg廃棄（25%）
    const c = await mk(2, 1); // 使用中
    await mk(1, 40); // 期間外
    assert.ok((await loss.saveLossRecord(prisma, { orderId: a, userId: R3, choice: { kind: "RATIO", quarters: 4 } })).ok);
    assert.ok((await loss.saveLossRecord(prisma, { orderId: b, userId: R3, choice: { kind: "RATIO", quarters: 1 } })).ok);
    assert.ok((await loss.saveLossRecord(prisma, { orderId: c, userId: R3, choice: { kind: "IN_USE" } })).ok);
    const sum = await loss.getLossSummary(prisma, rp.id, from, to);
    assert.equal(sum.totals.purchaseCount, 3, "期間内に受け取った3件（40日前は除外）");
    assert.equal(sum.totals.purchaseGrams, 7000);
    assert.equal(sum.totals.doneCount, 2);
    assert.equal(sum.totals.pendingCount, 1, "使用中は未完了");
    assert.equal(sum.totals.wasteGrams, 2000);
    assert.equal(sum.totals.lossRate, 2000 / 5000, "合計÷合計＝40%（単純平均なら62.5%）");
    // 商品代：1kg×1000円=1000円（送料別）→ 1000×100% + 4000×25% = 2000円
    assert.equal(sum.totals.lossYen, 2000, "送料はロス額に含めない");
    assert.equal(sum.totals.approximate, true);
  });

  await check("18. 注文前の案内：同じ食材の直近（受取日順）の振り返り済み注文で50%以上なら表示、50%ちょうどを含む", async () => {
    const L = await newListing(F, { totalKg: 20000, minKg: 1000, stepKg: 1000, price: 500 });
    const rp = await prisma.restaurantProfile.findUniqueOrThrow({ where: { userId: R2 } });
    const mk = async (kg: number, receivedDaysAgo: number) => {
      const o = okId(await order(R2, L, kg));
      assert.ok((await orders.approveOrder(prisma, { orderId: o, farmerUserId: F })).ok);
      assert.ok((await records.markReceived(prisma, { orderId: o, userId: R2 })).ok);
      await prisma.fulfillmentRecord.update({ where: { orderId: o }, data: { buyerReceivedAt: new Date(Date.now() - receivedDaysAgo * 86_400_000) } });
      return o;
    };
    assert.equal(await loss.getLossWarning(prisma, rp.id, "テスト茄子"), null, "記録がなければ出さない");
    const older = await mk(2, 5);
    const newer = await mk(2, 2);
    // 新しい受取の注文を先に記録し、古い受取の注文を後から記録（編集順ではなく受取日順で判定する）
    assert.ok((await loss.saveLossRecord(prisma, { orderId: newer, userId: R2, choice: { kind: "DIRECT", wasteKg: "1" } })).ok); // 50%ちょうど
    assert.ok((await loss.saveLossRecord(prisma, { orderId: older, userId: R2, choice: { kind: "RATIO", quarters: 0 } })).ok);
    const w = await loss.getLossWarning(prisma, rp.id, "テスト茄子");
    assert.ok(w && w.wasteGrams === 1000 && w.receivedGrams === 2000, "直近（受取日が新しい方）の50%ちょうどで表示");
    assert.equal(await loss.getLossWarning(prisma, rp.id, "テスト茄子（別品種）"), null, "名前が違う食材には出さない");
    assert.ok((await loss.saveLossRecord(prisma, { orderId: newer, userId: R2, choice: { kind: "DIRECT", wasteKg: "0.999" } })).ok);
    assert.equal(await loss.getLossWarning(prisma, rp.id, "テスト茄子"), null, "50%未満なら出さない");
    // 直近が使用中なら、振り返り済みの中で直近のもの（古い方：ロスなし）で判定
    assert.ok((await loss.saveLossRecord(prisma, { orderId: newer, userId: R2, choice: { kind: "IN_USE" } })).ok);
    assert.equal(await loss.getLossWarning(prisma, rp.id, "テスト茄子"), null);
    // 案内があっても申込は通常どおり（サーバーの検証を通る）
    assert.ok((await loss.saveLossRecord(prisma, { orderId: newer, userId: R2, choice: { kind: "RATIO", quarters: 4 } })).ok);
    assert.ok(await loss.getLossWarning(prisma, rp.id, "テスト茄子"));
    const again = await order(R2, L, 1);
    assert.ok(again.ok, "案内は注文を禁止しない");
    const st = await stock(L);
    assert.ok(st.sold + st.held <= st.total);
  });
  await check("19. 送料表の編集：既存注文の送料・総額は変わらず、新しい申込だけ新しい送料／重なりはエラー", async () => {
    const L = await newListing(F2, { totalKg: 10000, minKg: 1000, stepKg: 1000, price: 500 });
    const opt = await prisma.deliveryOption.findFirstOrThrow({ where: { listingId: L, active: true } });
    const o1 = okId(await order(R1, L, 2));
    const before = await prisma.order.findUniqueOrThrow({ where: { id: o1 } });
    const bad = await updateShippingRates(prisma, {
      farmerUserId: F2, listingId: L, deliveryOptionId: opt.id,
      rates: [
        { prefecture: "大阪府", minGramsExclusive: 0, maxGramsInclusive: 3000, feeYen: 900 },
        { prefecture: "大阪府", minGramsExclusive: 2000, maxGramsInclusive: 5000, feeYen: 1000 },
      ],
    });
    assert.ok(!bad.ok, "重なる重量帯は保存できない");
    const other = await updateShippingRates(prisma, {
      farmerUserId: F, listingId: L, deliveryOptionId: opt.id,
      rates: [{ prefecture: "大阪府", minGramsExclusive: 0, maxGramsInclusive: 5000, feeYen: 1 }],
    });
    assert.ok(!other.ok, "他の農家は送料表を変更できない");
    const r = await updateShippingRates(prisma, {
      farmerUserId: F2, listingId: L, deliveryOptionId: opt.id,
      rates: [
        { prefecture: "大阪府", minGramsExclusive: 0, maxGramsInclusive: 2000, feeYen: 950 },
        { prefecture: "大阪府", minGramsExclusive: 2000, maxGramsInclusive: 10000, feeYen: 1500 },
        { prefecture: "京都府", minGramsExclusive: 0, maxGramsInclusive: 10000, feeYen: 0 },
      ],
    });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o1 } });
    assert.equal(after.shippingFeeYen, before.shippingFeeYen, "既存注文の送料は変わらない");
    assert.equal(after.totalYen, before.totalYen);
    const o2 = await prisma.order.findUniqueOrThrow({ where: { id: okId(await order(R2, L, 2)) } });
    assert.equal(o2.shippingFeeYen, 950, "新しい申込は新しい送料");
    assert.equal(o2.totalYen, 1000 + 950);
    await assertInvariant(L);
  });

  await check("20. お試しセット：数量・価格はサーバーで決まり、同じ農家につき1店1回、農家の見送りは回数に数えない", async () => {
    const FT = await makeUser("FARMER", "ft", "京都府");
    const L = await newListing(FT, { totalKg: 10000, minKg: 2000, stepKg: 1000, price: 800 });
    const L2 = await newListing(FT, { totalKg: 10000, minKg: 2000, stepKg: 1000, price: 800 });
    assert.ok(!(await order(R1, L, 1, { isTrial: true })).ok, "お試し未設定なら申し込めない");
    assert.ok((await updateTrialSettings(prisma, { farmerUserId: FT, listingId: L, enabled: true, setGrams: 1000, priceYen: 300, count: 2 })).ok);
    assert.ok((await updateTrialSettings(prisma, { farmerUserId: FT, listingId: L2, enabled: true, setGrams: 1000, priceYen: 300, count: 2 })).ok);
    assert.ok(!(await updateTrialSettings(prisma, { farmerUserId: F, listingId: L, enabled: true, setGrams: 1000, priceYen: 1, count: 2 })).ok, "他の農家は設定できない");
    // 店が送った数量（5kg）は使わず、お試しセットの量と価格で計算する
    const t1 = await prisma.order.findUniqueOrThrow({ where: { id: okId(await order(R1, L, 5, { isTrial: true })) } });
    assert.equal(t1.isTrial, true);
    assert.equal(t1.quantityGrams, 1000);
    assert.equal(t1.totalYen, 300 + 800);
    assert.ok(!(await order(R1, L2, 1, { isTrial: true })).ok, "同じ農家の別の出品でも、2回目のお試しはできない");
    assert.ok((await order(R1, L, 2)).ok, "通常の注文はできる");
    const proposal = await orders.proposeChange(prisma, { orderId: t1.id, farmerUserId: FT, newQuantityGrams: 1000, newScheduleSlotId: t1.scheduleSlotId });
    assert.ok(!proposal.ok, "お試しは条件変更できない（承認か見送り）");
    const t2 = okId(await order(R2, L, 1, { isTrial: true }));
    assert.ok(!(await order(R3, L, 1, { isTrial: true })).ok, "残りセットがない");
    assert.ok((await orders.declineOrder(prisma, { orderId: t2, farmerUserId: FT })).ok);
    assert.ok((await order(R2, L, 1, { isTrial: true })).ok, "農家が見送ったお試しは回数に数えない");
    await assertInvariant(L);
  });

  await check("21. お試しセット：同時申込で設定セット数を超えない／農家の1日上限（受け渡し日ごと）を守る", async () => {
    const FC = await makeUser("FARMER", "fc", "京都府");
    const L = await newListing(FC, { totalKg: 10000, minKg: 1000, stepKg: 1000, price: 800 });
    assert.ok((await updateTrialSettings(prisma, { farmerUserId: FC, listingId: L, enabled: true, setGrams: 1000, priceYen: 300, count: 1 })).ok);
    const rs = await Promise.all([R1, R2, R3].map((r) => order(r, L, 1, { isTrial: true })));
    assert.equal(rs.filter((r) => r.ok).length, 1, "1セットに同時申込しても成功は1件");
    await assertInvariant(L);

    const FD = await makeUser("FARMER", "fd", "京都府");
    await prisma.farmerProfile.update({ where: { userId: FD }, data: { trialDailyLimit: 1 } });
    const L2 = await newListing(FD, { totalKg: 10000, minKg: 1000, stepKg: 1000, price: 800 });
    assert.ok((await updateTrialSettings(prisma, { farmerUserId: FD, listingId: L2, enabled: true, setGrams: 1000, priceYen: 300, count: 5 })).ok);
    const opt = await prisma.deliveryOption.findFirstOrThrow({ where: { listingId: L2 }, include: { scheduleSlots: { orderBy: { startsAt: "asc" } } } });
    assert.ok((await order(R1, L2, 1, { isTrial: true })).ok);
    assert.ok(!(await order(R2, L2, 1, { isTrial: true })).ok, "同じ受け渡し日は1日上限で止まる");
    const nextDay = await order(R2, L2, 1, { isTrial: true, scheduleSlotId: opt.scheduleSlots[1].id });
    assert.ok(nextDay.ok, nextDay.ok ? "" : `別の受け渡し日なら申し込める：${nextDay.error}`);
    await assertInvariant(L2);
  });

  await check("22. 農家さんへの質問：同じ出品は同じ会話を続け、未読・終了・当事者だけを守る", async () => {
    const L = await newListing(F2, { totalKg: 5000, minKg: 1000, stepKg: 1000, price: 500 });
    const a = await records.openInquiry(prisma, { listingId: L, restaurantUserId: R3, body: "送料を教えてください" });
    if (!a.ok) throw new Error(a.error);
    const b = await records.openInquiry(prisma, { listingId: L, restaurantUserId: R3, body: "もう一つ質問です" });
    assert.ok(b.ok && b.inquiryId === a.inquiryId, "同じ出品へのやり取り中の質問は1つの会話にまとまる");
    assert.equal((await records.listMyInquiries(prisma, F2, "FARMER")).find((i) => i.id === a.inquiryId)?.unread, true, "農家に未読が付く");
    assert.equal((await records.listMyInquiries(prisma, R3, "RESTAURANT")).find((i) => i.id === a.inquiryId)?.unread, false);
    await records.markInquiryRead(prisma, { inquiryId: a.inquiryId, userId: F2 });
    assert.equal((await records.listMyInquiries(prisma, F2, "FARMER")).find((i) => i.id === a.inquiryId)?.unread, false, "開くと既読");
    const intruder = await records.postInquiryMessage(prisma, { inquiryId: a.inquiryId, userId: R1, body: "のぞき見" });
    assert.ok(!intruder.ok, "当事者以外は書き込めない");
    assert.equal((await records.listMyInquiries(prisma, R1, "RESTAURANT")).some((i) => i.id === a.inquiryId), false, "当事者以外の一覧に出ない");
    const st = await stock(L);
    assert.equal(st.held, 0, "質問では在庫を確保しない");
    assert.ok((await closeListing(prisma, { farmerUserId: F2, listingId: L })).ok);
    assert.ok((await records.postInquiryMessage(prisma, { inquiryId: a.inquiryId, userId: F2, body: "受付は終わりましたが回答します" })).ok, "出品の受付終了では会話は終わらない");
    assert.ok((await records.closeInquiry(prisma, { inquiryId: a.inquiryId, userId: R3 })).ok);
    assert.ok(!(await records.postInquiryMessage(prisma, { inquiryId: a.inquiryId, userId: R3, body: "追加" })).ok, "終えた会話には書き込めない");
  });

  await check("23. 関西2府4県以外の農家は出品できない", async () => {
    const FO = await makeUser("FARMER", "fo", "茨城県");
    const r = await createListing(prisma, { farmerUserId: FO, data: listingInput({ totalKg: 1000, minKg: 1000, stepKg: 1000, price: 500 }), photo: PHOTO });
    assert.ok(!r.ok, "対象地域外では出品できない");
  });
} finally {
  // このテストで作ったデータだけを削除する
  const users = await prisma.user.findMany({ where: { id: { startsWith: `${RUN}-` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.listingInquiry.deleteMany({ where: { restaurant: { userId: { in: ids } } } });
  await prisma.lossRecord.deleteMany({ where: { restaurant: { userId: { in: ids } } } });
  await prisma.reviewReport.deleteMany({ where: { review: { restaurant: { userId: { in: ids } } } } });
  await prisma.reviewReply.deleteMany({ where: { review: { restaurant: { userId: { in: ids } } } } });
  await prisma.review.deleteMany({ where: { restaurant: { userId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { restaurant: { userId: { in: ids } } } });
  await prisma.listing.deleteMany({ where: { farmer: { userId: { in: ids } } } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: RUN } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`\nテスト用データを削除しました（${ids.length}アカウント分）`);
  console.log(`結果：成功 ${passed}／失敗 ${failed}`);
  process.exit(failed ? 1 : 0);
}
