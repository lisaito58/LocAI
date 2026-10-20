// 郵便番号の整形と検証（ブラウザとサーバーで同じ関数を使う）
// 全角数字・いろいろなハイフン・空白・〒 を整えてから、7桁の数字か確かめる。
export function normalizePostal(raw: string): string {
  return (raw ?? "")
    .trim()
    .replace(/^〒/, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[‐‑‒–—―−－ーｰ\s　-]/g, "");
}

export type PostalCheck = { ok: true; digits: string; display: string } | { ok: false; message: string };

export function checkPostal(raw: string): PostalCheck {
  const d = normalizePostal(raw);
  if (!d) return { ok: false, message: "郵便番号を入力してください" };
  if (/\D/.test(d)) return { ok: false, message: "郵便番号は数字7桁で入力してください（ハイフンはあってもなくても可）" };
  if (d.length !== 7) return { ok: false, message: "郵便番号の桁数を確認してください（7桁）" };
  return { ok: true, digits: d, display: `${d.slice(0, 3)}-${d.slice(3)}` };
}
