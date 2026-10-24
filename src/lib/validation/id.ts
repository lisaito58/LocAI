// 画面から渡されるID（ボタンに埋め込まれた注文IDなど）は改ざんされうるので、DBに問い合わせる前に形を確かめる。
// このアプリのIDは英数字・ハイフン・下線だけの64文字以内（cuid・UUID）なので、正常な画面操作では必ず通る。
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(...values: unknown[]): boolean {
  return values.every((v) => typeof v === "string" && ID_PATTERN.test(v));
}

export const INVALID_REQUEST_MESSAGE = "操作を受け付けられませんでした。画面を開き直してから、もう一度お試しください。";
