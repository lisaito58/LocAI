"use server";
// レビューの投稿・返信・通報（認証・ロール・当事者はドメイン側でも確認する）
import { refresh } from "next/cache";
import type { ActionResult } from "@/components/action-button";
import { postReview, replyToReview, reportReview } from "@/lib/domain/reviews";
import { allowAction, RATE_LIMIT_MESSAGE, requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function postReviewAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("RESTAURANT");
  if (!(await allowAction(user.id, "review", 10, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const rating = String(formData.get("rating") ?? "");
  if (rating !== "GOOD" && rating !== "CONCERN") return { ok: false, error: "「よかった」か「気になる点があった」を選んでください" };
  const r = await postReview(prisma, {
    orderId,
    userId: user.id,
    rating,
    tags: formData.getAll("tags").map(String),
    comment: String(formData.get("comment") ?? ""),
  });
  refresh();
  return r.ok ? { ok: true, message: "レビューを投稿しました" } : r;
}

export async function replyReviewAction(reviewId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (!(await allowAction(user.id, "review", 10, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const r = await replyToReview(prisma, { reviewId, userId: user.id, body: String(formData.get("body") ?? "") });
  refresh();
  return r.ok ? { ok: true, message: "返信を保存しました" } : r;
}

export async function reportReviewAction(reviewId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await allowAction(user.id, "review-report", 5, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const r = await reportReview(prisma, { reviewId, userId: user.id, reason: String(formData.get("reason") ?? "") });
  if (!r.ok) return r;
  return { ok: true, message: r.already ? "このレビューはすでに通報済みです" : "通報を受け付けました。運営が確認します（自動では削除されません）" };
}
