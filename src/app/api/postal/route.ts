// 郵便番号から住所の候補を調べる（zipcloud の郵便番号検索API を、アプリのサーバー経由で呼ぶ）
// - 外部に送るのは郵便番号7桁だけ（氏名・住所全文などは送らない）
// - 利用規約で「常に最新の情報を表示」とあるため、結果は保存・使い回しをしない
// - 分かるのは町域まで。番地・建物名は本人が入力する。結果は住所の実在確認や本人確認ではない
// - 該当なし／通信失敗／時間切れを区別して返す。失敗しても手入力で登録を続けられる
import { allowAction } from "@/lib/guard";
import { getCurrentUser } from "@/lib/session";
import { checkPostal } from "@/lib/validation/postal";

const ZIPCLOUD = "https://zipcloud.ibsnet.co.jp/api/search";

type ZipResult = { address1: string; address2: string; address3: string };

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ status: "error", message: "ログインしてください" }, { status: 401 });
  if (!(await allowAction(user.id, "postal", 20, 60))) {
    return Response.json({ status: "error", message: "検索が続いています。少し待ってからもう一度お試しください" }, { status: 429 });
  }
  const check = checkPostal(new URL(req.url).searchParams.get("code") ?? "");
  if (!check.ok) return Response.json({ status: "invalid", message: check.message }, { status: 400 });

  try {
    const res = await fetch(`${ZIPCLOUD}?zipcode=${check.digits}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const body = (await res.json()) as { status: number; results: ZipResult[] | null };
    if (body.status !== 200) throw new Error(`api ${body.status}`);
    const results = (body.results ?? [])
      .filter((r) => typeof r.address1 === "string" && typeof r.address2 === "string")
      .map((r) => ({ prefecture: r.address1, city: r.address2, town: typeof r.address3 === "string" ? r.address3 : "" }));
    if (results.length === 0) return Response.json({ status: "notfound", postal: check.display });
    return Response.json({ status: "ok", postal: check.display, results });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    // 郵便番号以外の情報はログに出さない
    console.warn(`[postal] 検索に失敗しました: ${timeout ? "timeout" : "error"}`);
    return Response.json({ status: timeout ? "timeout" : "error" }, { status: 502 });
  }
}
