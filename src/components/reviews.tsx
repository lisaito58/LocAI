// レビューの表示（星や点数は使わず、件数と具体的な内容を文字で示す）
import { postReviewAction, replyReviewAction, reportReviewAction } from "@/app/actions/reviews";
import { ActionButton } from "@/components/action-button";
import { ReqMark } from "@/components/fields";
import type { getFarmerReviews } from "@/lib/domain/reviews";
import { REVIEW_RATING_LABELS, REVIEW_TAGS, REVIEW_TEXT_MAX } from "@/lib/domain/reviews";
import { formatJstDate } from "@/lib/domain/units";

type Summary = Awaited<ReturnType<typeof getFarmerReviews>>;

const RATING_STYLE = {
  GOOD: { emoji: "😊", cls: "bg-green-100 text-green-900" },
  CONCERN: { emoji: "🤔", cls: "bg-amber-100 text-amber-950" },
} as const;

export function ReviewList({ summary, canReply = false, canReport = true }: { summary: Summary; canReply?: boolean; canReport?: boolean }) {
  if (summary.total === 0) {
    return <p className="rounded-2xl bg-white px-3 py-3 text-gray-800 ring-1 ring-green-100">まだ取引レビューはありません。</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        実際に受け取ったお店のレビュー {summary.total}件：😊 よかった {summary.good}件 ／ 🤔 気になる点があった {summary.concern}件
      </p>
      <ul className="flex flex-wrap gap-2 text-sm">
        {REVIEW_TAGS.map((t) => (
          <li key={t} className="badge bg-leaf-light px-3 py-1 text-sm text-leaf-dark">
            {t} {summary.tagCounts[t]}件
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2">
        {summary.recent.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-3 ring-1 ring-green-100">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`badge px-3 py-1 text-sm ${RATING_STYLE[r.rating].cls}`}>
                {RATING_STYLE[r.rating].emoji} {REVIEW_RATING_LABELS[r.rating]}
              </span>
              <span>🏮 {r.restaurant.shopName}</span>
              <span className="text-gray-700">
                {r.order.snapItemName} ・ {formatJstDate(r.createdAt)}
              </span>
            </div>
            {r.tags.length > 0 && <p className="mt-1 text-sm">✔ {r.tags.join("・")}</p>}
            {r.comment && <p className="mt-1 whitespace-pre-wrap">{r.comment}</p>}
            {r.reply && (
              <div className="mt-2 rounded-xl bg-leaf-light/60 px-3 py-2 text-sm">
                <span className="font-bold">👩‍🌾 農家さんからの返信：</span>
                <span className="whitespace-pre-wrap">{r.reply.body}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {canReply && (
                <details className="w-full">
                  <summary className="cursor-pointer text-sm font-bold text-leaf-dark">{r.reply ? "返信を書き直す" : "このレビューに返信する"}</summary>
                  <ActionButton
                    action={replyReviewAction.bind(null, r.id)}
                    className="btn-primary btn-sm mt-2 self-start"
                    fields={
                      <textarea name="body" required maxLength={REVIEW_TEXT_MAX} rows={2} className="input mt-2" defaultValue={r.reply?.body} placeholder="返信（200文字以内・公開されます）" />
                    }
                  >
                    返信を保存
                  </ActionButton>
                </details>
              )}
              {canReport && (
                <details className="w-full">
                  <summary className="cursor-pointer text-sm text-gray-700">🚩 このレビューを通報する</summary>
                  <ActionButton
                    action={reportReviewAction.bind(null, r.id)}
                    className="btn-secondary btn-sm mt-2 self-start"
                    fields={
                      <input name="reason" required maxLength={REVIEW_TEXT_MAX} className="input mt-2" placeholder="通報の理由（例：個人情報が書かれている）" />
                    }
                  >
                    通報する
                  </ActionButton>
                  <p className="hint mt-1">通報だけでは削除されません。運営が内容を確認します。</p>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 店：受け取った注文へのレビュー投稿
export function ReviewForm({ orderId }: { orderId: string }) {
  return (
    <ActionButton
      action={postReviewAction.bind(null, orderId)}
      className="btn-primary self-start"
      confirmText="この内容でレビューを投稿しますか？（投稿後は削除できません）"
      fields={
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1">
            <legend className="label mb-1">
              取引はどうでしたか？
              <ReqMark required />
            </legend>
            <div className="flex flex-wrap gap-2">
              {(["GOOD", "CONCERN"] as const).map((k) => (
                <label
                  key={k}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-green-200 bg-white px-4 font-bold has-checked:border-leaf has-checked:bg-leaf-light has-focus-visible:ring-4 has-focus-visible:ring-green-200"
                >
                  <input type="radio" name="rating" value={k} required className="size-5 accent-green-700" />
                  {RATING_STYLE[k].emoji} {REVIEW_RATING_LABELS[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="label mb-1">
              当てはまるもの
              <ReqMark optional />
            </legend>
            <div className="flex flex-wrap gap-2">
              {REVIEW_TAGS.map((t) => (
                <label key={t} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-green-200 bg-white px-4 has-checked:border-leaf has-checked:bg-leaf-light">
                  <input type="checkbox" name="tags" value={t} className="size-5 accent-green-700" />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="label">
              コメント（200文字以内）
              <ReqMark optional />
            </span>
            <textarea name="comment" maxLength={REVIEW_TEXT_MAX} rows={3} className="input" placeholder="例：写真どおりの大きさで、受け渡しの連絡も丁寧でした" />
            <span className="hint">公開されます。住所・電話番号・メールアドレスなどは書かないでください。味の好みより、掲載内容との違いや取引の様子が伝わると参考になります。</span>
          </label>
        </div>
      }
    >
      ✍️ レビューを投稿する
    </ActionButton>
  );
}
