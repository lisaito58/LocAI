"use client";
// AI相談（キャラクター「にんじん」）。画面端のボタンから開くチャット。
// - AIの回答であることを常に表示する（人間のスタッフにはつながらない）
// - AIは注文・価格変更などを実行しない。検索への反映は「この条件で探す」を本人が押したときだけ
// - 会話はこのタブの sessionStorage にアカウントごとに保存し、ログアウトで消える
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { askAiChat } from "@/app/actions/ai-chat";
import type { ChatAnswer } from "@/lib/ai/chat";

const CHARACTER = "/characters/ai-carrot.png";
const MAX_CHARS = 300;
const STORE_PREFIX = "locai:ai-chat:";

type Extra = Omit<ChatAnswer, "reply">;
type Msg = { role: "user" | "ai"; text: string; extra?: Extra };

type Quick = { label: string; text: string; fill?: boolean };
const QUICK: Record<"RESTAURANT" | "FARMER", Quick[]> = {
  RESTAURANT: [
    { label: "🧮 料理と人数から量を知りたい", text: "（料理名）を（人数）人分作ります。（野菜）はどれくらい必要？", fill: true },
    { label: "🔄 代わりの野菜を知りたい", text: "（野菜）の代わりになる野菜はある？", fill: true },
    { label: "🧺 注文の流れは？", text: "注文の流れを教えて" },
    { label: "🚚 送料はどう決まる？", text: "送料はどう決まる？" },
  ],
  FARMER: [
    { label: "📝 出品のしかたは？", text: "出品のしかたを教えて" },
    { label: "💴 送料表の作り方は？", text: "送料表の作り方を教えて" },
    { label: "🧺 お試し販売とは？", text: "お試し販売について教えて" },
    { label: "📊 掲載価格の参考を見たい", text: "（品目）の価格の参考を知りたい", fill: true },
  ],
};

const GREETING: Record<"RESTAURANT" | "FARMER", string> = {
  RESTAURANT: "こんにちは、にんじんです🥕 料理と人数から必要な量の目安を計算したり、代わりの野菜や掲載中の出品を探すお手伝いをします。",
  FARMER: "こんにちは、にんじんです🥕 アプリの使い方や、アプリ内の掲載価格の参考を調べるお手伝いをします。",
};

function load(key: string): Msg[] {
  try {
    const raw = sessionStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// スマホで文字入力中（キーボード表示中）は、画面端のボタンを隠す
function useTypingOutside(panelOpen: boolean) {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("focusin", cb);
      document.addEventListener("focusout", cb);
      return () => {
        document.removeEventListener("focusin", cb);
        document.removeEventListener("focusout", cb);
      };
    },
    () => {
      if (panelOpen) return false;
      const el = document.activeElement;
      return !!el && el.matches("input:not([type=checkbox]):not([type=radio]), textarea, select") && window.innerWidth < 768;
    },
    () => false,
  );
}

export function AiChat({ role, userId }: { role: "RESTAURANT" | "FARMER"; userId: string }) {
  const key = STORE_PREFIX + userId;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typing = useTypingOutside(open);
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // 開いたときに、このアカウントの会話を読み込む（別アカウントの会話は消す）
  function openPanel() {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(STORE_PREFIX) && k !== key)
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    setMsgs(load(key));
    setOpen(true);
  }
  function closePanel() {
    setOpen(false);
    fabRef.current?.focus();
  }
  function save(next: Msg[]) {
    setMsgs(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next.slice(-30)));
    } catch {}
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePanel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, pending, error, open]);

  async function send(history: Msg[]) {
    setPending(true);
    setError(null);
    try {
      const r = await askAiChat(history.map((m) => ({ role: m.role, text: m.text })));
      if (r.ok) {
        const { reply, ...extra } = r.answer;
        save([...history, { role: "ai", text: reply, extra }]);
      } else {
        setError(r.error);
      }
    } catch {
      setError("通信できませんでした。電波のよい場所で、もう一度送ってください。");
    } finally {
      setPending(false);
    }
  }

  function submit() {
    const t = text.trim();
    if (!t || pending || t.length > MAX_CHARS) return;
    const next = [...msgs, { role: "user" as const, text: t }];
    save(next);
    setText("");
    void send(next);
  }

  function quick(q: Quick) {
    if (q.fill) {
      setText(q.text);
      inputRef.current?.focus();
      return;
    }
    if (pending) return;
    const next = [...msgs, { role: "user" as const, text: q.text }];
    save(next);
    void send(next);
  }

  const lastIsUser = msgs.at(-1)?.role === "user";

  return (
    <>
      {!open && !typing && (
        <button
          ref={fabRef}
          id="ai-fab"
          type="button"
          onClick={openPanel}
          aria-haspopup="dialog"
          className="ai-fab fixed right-3 z-30 flex items-center gap-1 rounded-full border-2 border-orange-300 bg-white py-1 pr-4 pl-1 font-bold text-orange-950 shadow-lg hover:bg-orange-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-orange-500 md:right-6"
        >
          <Image src={CHARACTER} alt="" width={48} height={48} className="size-12" priority={false} />
          AIに相談
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex flex-col bg-white md:inset-auto md:right-6 md:bottom-6 md:h-[min(42rem,calc(100dvh-3rem))] md:w-[26rem] md:rounded-3xl md:border-2 md:border-orange-200 md:shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b-2 border-orange-100 bg-orange-50 px-3 py-2 md:rounded-t-3xl">
            <Image src={CHARACTER} alt="" width={44} height={44} className="size-11" />
            <h2 id={titleId} className="flex-1 font-bold text-orange-950">
              AIに相談
              <span className="block text-sm font-medium text-gray-800">にんじん（AI）が答えます</span>
            </h2>
            <button type="button" onClick={closePanel} className="menu-toggle">
              ✕ 閉じる
            </button>
          </div>

          <p className="border-b border-orange-100 bg-white px-3 py-2 text-sm text-gray-800">
            🤖 回答はAIが作ります（人間のスタッフにはつながりません）。間違うことがあるので、注文・送料・期限は各画面で確認してください。AIは注文・価格や在庫の変更などはできません。
          </p>

          <div className="flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
            <div className="flex flex-col gap-3">
              <AiBubble text={GREETING[role]} />
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <p key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-leaf px-3 py-2 whitespace-pre-wrap text-white">
                    <span className="sr-only">あなた：</span>
                    {m.text}
                  </p>
                ) : (
                  <AiBubble key={i} text={m.text}>
                    {m.extra && <Extras extra={m.extra} onNavigate={() => setOpen(false)} />}
                  </AiBubble>
                ),
              )}
              {pending && <AiBubble text="考えています…🥕" />}
              {error && (
                <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-3 text-red-900">
                  <p>⚠️ {error}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {lastIsUser && (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => void send(msgs)} disabled={pending}>
                        🔁 もう一度送る
                      </button>
                    )}
                    <Link href="/help" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
                      ❓ よくある質問
                    </Link>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t-2 border-orange-100 bg-white px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:rounded-b-3xl">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="よく使う質問">
              {QUICK[role].map((q) => (
                <button key={q.label} type="button" onClick={() => quick(q)} disabled={pending && !q.fill} className="shrink-0 rounded-full border-2 border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-bold text-orange-950 hover:bg-orange-100">
                  {q.label}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="flex flex-1 flex-col gap-0.5">
                <span className="sr-only">AIへの質問</span>
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                  maxLength={MAX_CHARS}
                  placeholder="例：カレーを30人分作ります。玉ねぎはどれくらい必要？"
                  className="input min-h-12 resize-none"
                />
                <span className="text-sm text-gray-800">
                  住所・電話番号などは入力しないでください（{text.length}/{MAX_CHARS}）
                </span>
              </label>
              <button type="submit" className="btn-primary mb-7 shrink-0" disabled={pending || !text.trim()}>
                送る
              </button>
            </form>
            {msgs.length > 0 && (
              <button
                type="button"
                className="self-start text-sm font-bold text-gray-800 underline"
                onClick={() => {
                  if (window.confirm("この会話を消しますか？")) {
                    save([]);
                    setError(null);
                  }
                }}
              >
                🧹 会話を消す
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AiBubble({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-start gap-2">
      <Image src={CHARACTER} alt="" width={36} height={36} className="size-9 shrink-0" />
      <div className="flex min-w-0 flex-col gap-2 rounded-2xl rounded-tl-sm bg-orange-50 px-3 py-2 ring-1 ring-orange-100">
        <p className="whitespace-pre-wrap">
          <span className="sr-only">にんじん（AI）：</span>
          {text}
        </p>
        {children}
      </div>
    </div>
  );
}

function Extras({ extra, onNavigate }: { extra: Extra; onNavigate: () => void }) {
  const { estimate, listings, searchLink, priceRef } = extra;
  const href = searchLink ? `/shop/search?${new URLSearchParams({ item: searchLink.item, ...(searchLink.qty ? { qty: searchLink.qty } : {}) })}` : null;
  return (
    <>
      {estimate && (
        <div className="rounded-xl bg-white p-2 text-sm ring-1 ring-green-200">
          <p className="font-bold text-leaf-dark">🧮 アプリの計算（目安）</p>
          <p>
            {estimate.dish && `${estimate.dish}・`}
            {estimate.itemName}：1人分 約{estimate.gramsPerServing}g（AIの目安）× {estimate.servings}人分 ＝ {estimate.rawKg}kg
          </p>
          <p className="font-bold">→ 0.1kg単位に切り上げて {estimate.totalKg}kg</p>
          <p className="text-gray-800">料理・盛り付け・野菜の大きさで変わります。量はお店で決めてください。</p>
        </div>
      )}
      {searchLink && (
        <div className="flex flex-col gap-1 rounded-xl bg-white p-2 text-sm ring-1 ring-green-200">
          <p className="font-bold text-leaf-dark">🧺 掲載中の出品（アプリが表示）</p>
          {listings.length === 0 ? (
            <p>いま申し込める「{searchLink.item}」などの出品は見つかりませんでした。</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {listings.map((l) => (
                <li key={l.id}>
                  <Link href={`/shop/listings/${l.id}`} className="link" onClick={onNavigate}>
                    {l.itemName}
                  </Link>
                  （{l.farmArea}・{l.unitPriceYenPerKg.toLocaleString("ja-JP")}円/kg・残り{l.availableKg}kg）
                </li>
              ))}
            </ul>
          )}
          {href && (
            <Link href={href} className="btn-secondary btn-sm mt-1 self-start" onClick={onNavigate}>
              🔍 この条件で探す（{searchLink.item}
              {searchLink.qty && `・${searchLink.qty}kg`}）
            </Link>
          )}
          <p className="text-gray-800">押すまで検索条件は変わりません。AIが注文することはありません。</p>
        </div>
      )}
      {priceRef && (
        <div className="rounded-xl bg-white p-2 text-sm ring-1 ring-green-200">
          <p className="font-bold text-leaf-dark">📊 アプリ内の掲載価格の参考（{priceRef.itemName}）</p>
          {priceRef.enough ? (
            <>
              <p>
                ほかの農家さんの掲載中 {priceRef.count}件（商品代・円/kg）：最低 {priceRef.minYen.toLocaleString("ja-JP")}円／中央値{" "}
                {priceRef.medianYen.toLocaleString("ja-JP")}円／最高 {priceRef.maxYen.toLocaleString("ja-JP")}円
              </p>
              <p className="text-gray-800">
                同じ品目名（表記ゆれをそろえて一致）の、いま申し込める出品だけを集計しました。送料は含みません。市場相場や実際に売れた価格ではありません。価格は農家さんご自身で決めてください。
              </p>
            </>
          ) : (
            <p>
              比べられる掲載が{priceRef.count}件のため、参考値は出していません（3件以上で表示します）。市場相場の代わりにはなりません。
            </p>
          )}
        </div>
      )}
    </>
  );
}
