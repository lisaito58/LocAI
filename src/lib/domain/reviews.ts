// 簡易レビュー
// - 投稿：受取済み（販売確定かつ店が受取を記録）の注文の店だけ。1注文1件（DBの一意制約で重複を防ぐ）
// - 返信：レビューされた農家だけ（1件。本人は書き直せる）
// - 通報：ログインした利用者。通報だけでは削除しない（運営が確認する）
// - 削除：誰もできない。点数・件数は並び順に使わない。AIの文章は混ぜない
import { fail, isUniqueViolation, runTx, type Db, type Result } from "./tx";

export const REVIEW_TAGS = ["説明どおりの野菜", "丁寧なやり取り", "受け渡しがスムーズ"] as const;
export const REVIEW_RATING_LABELS = { GOOD: "よかった", CONCERN: "気になる点があった" } as const;
export const REVIEW_TEXT_MAX = 200;

// 公開されるコメントに連絡先を書かないよう、電話番号・メールアドレスらしい文字列を止める
function checkPublicText(text: string, label: string): string {
  const t = text.trim();
  if (t.length > REVIEW_TEXT_MAX) fail(`${label}は${REVIEW_TEXT_MAX}文字以内で入力してください`);
  const digits = t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/0\d{1,4}[-‐ー−\s]?\d{1,4}[-‐ー−\s]?\d{3,4}/.test(digits) || /\S+@\S+\.\S+/.test(t)) {
    fail(`${label}に電話番号やメールアドレスは書かないでください（公開されます）`);
  }
  return t;
}

export async function postReview(
  db: Db,
  input: { orderId: string; userId: string; rating: "GOOD" | "CONCERN"; tags: string[]; comment?: string },
): Promise<Result<{ reviewId: string }>> {
  try {
    return await runTx(db, async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { restaurant: { select: { id: true, userId: true } }, fulfillment: true, review: true },
      });
      if (!order || order.restaurant.userId !== input.userId) fail("注文が見つかりません");
      if (order.status !== "CONFIRMED" || !order.fulfillment?.buyerReceivedAt) {
        fail("レビューは、受け取りを記録した注文だけに投稿できます");
      }
      if (order.review) fail("この注文のレビューは投稿済みです");
      if (!["GOOD", "CONCERN"].includes(input.rating)) fail("「よかった」か「気になる点があった」を選んでください");
      const tags = [...new Set(input.tags)];
      if (tags.some((t) => !(REVIEW_TAGS as readonly string[]).includes(t))) fail("選べないタグが含まれています");
      const comment = input.comment ? checkPublicText(input.comment, "コメント") : "";
      const review = await tx.review.create({
        data: {
          orderId: order.id,
          restaurantId: order.restaurant.id,
          farmerId: order.farmerId,
          rating: input.rating,
          tags,
          comment: comment || null,
        },
      });
      return { reviewId: review.id };
    });
  } catch (error) {
    // 同時に2回送られた場合：先に保存された1件だけを残す
    if (isUniqueViolation(error)) return { ok: false, error: "この注文のレビューは投稿済みです" };
    throw error;
  }
}

export async function replyToReview(db: Db, input: { reviewId: string; userId: string; body: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    const review = await tx.review.findUnique({ where: { id: input.reviewId }, include: { farmer: { select: { userId: true } } } });
    if (!review || review.farmer.userId !== input.userId) fail("レビューが見つかりません");
    const body = checkPublicText(input.body, "返信");
    if (!body) fail("返信を入力してください");
    await tx.reviewReply.upsert({ where: { reviewId: review.id }, create: { reviewId: review.id, body }, update: { body } });
    return {};
  });
}

export async function reportReview(db: Db, input: { reviewId: string; userId: string; reason: string }): Promise<Result<{ already: boolean }>> {
  const reason = input.reason.trim();
  if (!reason || reason.length > REVIEW_TEXT_MAX) return { ok: false, error: `通報の理由を${REVIEW_TEXT_MAX}文字以内で入力してください` };
  const review = await db.review.findUnique({ where: { id: input.reviewId }, select: { id: true } });
  if (!review) return { ok: false, error: "レビューが見つかりません" };
  try {
    await db.reviewReport.create({ data: { reviewId: review.id, reporterId: input.userId, reason } });
    return { ok: true, already: false };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: true, already: true };
    throw error;
  }
}

// 公開用：農家へのレビュー（店の表示名だけを出し、メールアドレスや注文の詳細は出さない）
export async function getFarmerReviews(db: Db, farmerId: string, take = 10) {
  const [good, concern, tagRows, recent] = await Promise.all([
    db.review.count({ where: { farmerId, rating: "GOOD" } }),
    db.review.count({ where: { farmerId, rating: "CONCERN" } }),
    db.review.findMany({ where: { farmerId }, select: { tags: true } }),
    db.review.findMany({
      where: { farmerId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        rating: true,
        tags: true,
        comment: true,
        createdAt: true,
        restaurant: { select: { shopName: true } },
        order: { select: { snapItemName: true } },
        reply: { select: { body: true } },
      },
    }),
  ]);
  const tagCounts = Object.fromEntries(REVIEW_TAGS.map((t) => [t, tagRows.filter((r) => r.tags.includes(t)).length]));
  return { good, concern, total: good + concern, tagCounts, recent };
}
