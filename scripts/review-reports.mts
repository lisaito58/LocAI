// 運営向け：レビューの通報を確認する（管理画面は作らず、コマンドで確認する）
// 実行：npm run reports:list                       … 未確認の通報を表示
//       npm run reports:list -- --done <通報ID>     … 確認済みにする（レビューは削除しない）
// 表示するのは店名・農園名・レビュー本文・通報理由だけ。メールアドレスや住所は表示しない。
import "./load-env";
import { prisma } from "../src/lib/prisma";

const i = process.argv.indexOf("--done");
if (i !== -1) {
  const id = process.argv[i + 1];
  const r = await prisma.reviewReport.updateMany({ where: { id }, data: { status: "REVIEWED" } });
  console.log(r.count ? `通報 ${id} を確認済みにしました（レビューは削除していません）` : `通報 ${id} が見つかりません`);
  process.exit(0);
}

const reports = await prisma.reviewReport.findMany({
  where: { status: "OPEN" },
  orderBy: { createdAt: "asc" },
  include: {
    review: {
      select: {
        id: true,
        rating: true,
        comment: true,
        restaurant: { select: { shopName: true } },
        farmer: { select: { farmName: true } },
        reply: { select: { body: true } },
      },
    },
  },
});
if (reports.length === 0) console.log("未確認の通報はありません");
for (const r of reports) {
  console.log(`--- 通報ID ${r.id}（${r.createdAt.toISOString()}）`);
  console.log(`理由：${r.reason}`);
  console.log(`レビュー：${r.review.restaurant.shopName} → ${r.review.farmer.farmName}／${r.review.rating}`);
  console.log(`本文：${r.review.comment ?? "（コメントなし）"}`);
  if (r.review.reply) console.log(`返信：${r.review.reply.body}`);
}
process.exit(0);
