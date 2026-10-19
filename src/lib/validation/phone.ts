// 電話番号の整形と検証（ブラウザとサーバーで同じ関数を使う）
// 受け付ける形式：国内の番号のみ
//   固定電話：0から始まり市外局番から10桁（例 06-1234-5678）
//   携帯・IP電話：070/080/090/050 から始まる11桁（例 090-1234-5678）
//   0120・0570（10桁）、0800（11桁）
// 形式を確認するだけで、番号が実在する・本人のものであることは確認しない。

export const PHONE_HINT = "例：06-1234-5678、090-1234-5678（ハイフンはあってもなくても可・国内の番号のみ）";

// 全角数字・いろいろなハイフン・空白・かっこをそろえる
export function normalizePhone(raw: string): string {
  return raw
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[‐‑‒–—―−－ーｰ]/g, "-")
    .replace(/[\s　]*[()（）][\s　]*/g, "-")
    .replace(/[\s　]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export type PhoneCheck = { ok: true; value: string } | { ok: false; message: string };

export function checkPhone(raw: string): PhoneCheck {
  const value = normalizePhone(raw ?? "");
  if (!value) return { ok: false, message: "電話番号を入力してください" };
  if (value.startsWith("+")) return { ok: false, message: "国際電話の形式（+81など）は使えません。0から始まる国内の番号で入力してください" };
  if (/[^0-9-]/.test(value)) return { ok: false, message: "電話番号に文字や記号は使えません（数字とハイフンだけで入力してください）" };
  const digits = value.replace(/-/g, "");
  if (!digits.startsWith("0")) return { ok: false, message: "市外局番の0から入力してください" };
  const tenOk = digits.length === 10 && !digits.startsWith("00");
  const elevenOk = digits.length === 11 && /^(050|070|080|090|0800)/.test(digits);
  if (!tenOk && !elevenOk) {
    return { ok: false, message: "電話番号の桁数を確認してください（固定電話は市外局番から10桁、携帯電話は11桁）" };
  }
  return { ok: true, value };
}
