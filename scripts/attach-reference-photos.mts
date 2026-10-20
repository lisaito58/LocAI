// テスト・デモ用の出品に「参考画像」を付ける（実物写真ではない）
// 実行：npm run seed:photos
// - 対象：test-／demo- の架空アカウント（@locai.example）の公開中の出品で、今の公開回の写真がないものだけ
// - 画像：Wikimedia Commons の再利用できるライセンス（CC0／CC BY／CC BY-SA）の写真（scripts/reference-photos.json）
// - 画面には「テスト用の参考画像（実物ではありません）」と撮影者・ライセンス・出典を表示する
// - 既存の写真・注文は変更しない（追加だけ）。対応する画像がない品目は飛ばす
import "./load-env";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { dateToJstDateText, textToDateOnly } from "../src/lib/domain/units";
import { dbNow } from "../src/lib/domain/tx";
import { prisma } from "../src/lib/prisma";

type Ref = { title: string; source: string; image: string; license: string; author: string };
const refs: Record<string, Ref> = JSON.parse(readFileSync(new URL("./reference-photos.json", import.meta.url), "utf8"));

const listings = await prisma.listing.findMany({
  where: {
    status: "PUBLISHED",
    OR: [{ farmer: { user: { email: { startsWith: "test-" } } } }, { farmer: { user: { email: { startsWith: "demo-" } } } }],
  },
  select: { id: true, itemName: true, publishRound: true, photos: { select: { publishRound: true } }, farmer: { select: { user: { select: { email: true } } } } },
});
const today = textToDateOnly(dateToJstDateText(await dbNow(prisma)));
const cache = new Map<string, Buffer>();

async function download(url: string) {
  for (let t = 0; t < 4; t++) {
    await new Promise((r) => setTimeout(r, 1000 * (t + 1)));
    const res = await fetch(url, { headers: { "User-Agent": "LocAI-test-data/0.1 (student project; test images)" } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`画像を取得できませんでした：${url}`);
}

let added = 0;
const skipped: string[] = [];
for (const l of listings) {
  if (!l.farmer.user.email.endsWith("@locai.example")) continue;
  if (l.photos.some((p) => p.publishRound === l.publishRound)) continue;
  const ref = refs[l.itemName];
  if (!ref) {
    skipped.push(l.itemName);
    continue;
  }
  if (!cache.has(l.itemName)) {
    const raw = await download(ref.image);
    cache.set(l.itemName, await sharp(raw).rotate().resize(800, 800, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer());
  }
  const id = crypto.randomUUID();
  await prisma.listingPhoto.create({
    data: {
      id,
      listingId: l.id,
      publishRound: l.publishRound,
      url: `/api/photos/${id}`,
      storageKey: `reference:${ref.title}`,
      takenOn: today,
      selfTakenConfirmed: false,
      referenceCredit: `${ref.author} / ${ref.license} / Wikimedia Commons`,
      referenceSourceUrl: ref.source,
      blob: { create: { contentType: "image/jpeg", data: new Uint8Array(cache.get(l.itemName)!) } },
    },
  });
  added++;
}
console.log(`完了：参考画像を ${added} 件の出品に付けました${skipped.length ? `（画像がなく飛ばした品目：${[...new Set(skipped)].join("、")}）` : ""}`);
process.exit(0);
