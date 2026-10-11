"use client";
// 出品フォーム（新規・複製・再公開）
// 入力途中の内容はこのブラウザに下書き保存する（写真ファイルは保存しない）。
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { useHasStored } from "@/components/use-stored-flag";
import { submitListing } from "@/app/actions/listings";
import { FormMessage } from "@/app/form-parts";
import type { ListingDraft, ListingFormProps, Method, Option } from "./listing-defaults";
import { METHOD_EMOJI, newOption } from "./listing-defaults";
import {
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TIMING_LABELS,
  PREFECTURES,
  SIZE_LABELS,
} from "@/lib/validation/listing";

// ブラウザで縮小してから送る（容量を抑え、撮影情報などのメタデータも落とす）
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize"))), "image/jpeg", 0.85),
  );
}

export function ListingForm({ mode, sourceId, initial, farmPrefecture, currentAvailableKg }: ListingFormProps) {
  const draftKey = `locai:listing-draft:${mode}:${sourceId ?? ""}`;
  const [v, setV] = useState<ListingDraft>(initial);
  const [restored, setRestored] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selfTaken, setSelfTaken] = useState(false);
  const [state, dispatch, pending] = useActionState(submitListing, undefined);
  const [clientError, setClientError] = useState<string | null>(null);

  // 下書きの保存と復元（写真・住所などは保存しない）。復元は本人がボタンで選ぶ
  const hasDraft = useHasStored(draftKey);
  const [touched, setTouched] = useState(false);
  function restoreDraft() {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setV({ ...initial, ...JSON.parse(saved) });
      setRestored(true);
    } catch {}
  }
  useEffect(() => {
    if (!touched) return; // 開いただけでは前回の下書きを上書きしない
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(v));
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [v, draftKey, touched]);

  const set = <K extends keyof ListingDraft>(k: K, value: ListingDraft[K]) => {
    setTouched(true);
    setV((p) => ({ ...p, [k]: value }));
  };
  const setOption = (i: number, patch: Partial<Option>) => {
    setTouched(true);
    setV((p) => ({ ...p, deliveryOptions: p.deliveryOptions.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    if (!photo) return setClientError("実物の写真を選んでください");
    let blob: Blob;
    try {
      blob = await resizeImage(photo);
    } catch {
      return setClientError("写真を読み込めませんでした。別の写真を選んでください");
    }
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ ...v, photoSelfTaken: selfTaken }));
    fd.set("photo", blob, "photo.jpg");
    fd.set("mode", mode);
    if (sourceId) fd.set("sourceId", sourceId);
    // 送信したら下書きは消す（失敗した場合も画面の入力はそのまま残る）
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    startTransition(() => dispatch(fd));
  }

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setV(initial);
    setRestored(false);
    setTouched(false);
  }

  const usedMethods = v.deliveryOptions.map((o) => o.method);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {hasDraft && !restored && !touched && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-sm text-sky-900">
          📝 このブラウザに入力途中の下書きがあります。
          <button type="button" onClick={restoreDraft} className="btn-secondary btn-sm">
            下書きを復元する
          </button>
        </div>
      )}
      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          📝 下書きを復元しました。期限・数量・写真は今回の値を確認してください。
          <button type="button" onClick={clearDraft} className="btn-secondary btn-sm">
            下書きを消す
          </button>
        </div>
      )}

      {/* 食材 */}
      <section className="card flex flex-col gap-4">
        <h2 className="section-title">🥬 食材</h2>
        <L label="食材名（品種も書けます）">
          <input className="input" value={v.itemName} onChange={(e) => set("itemName", e.target.value)} maxLength={50} required placeholder="賀茂茄子" />
        </L>
        <L label="説明（公開）">
          <textarea className="input" rows={3} maxLength={500} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="朝どれをその日に箱詰めします" />
        </L>
        <L label="特徴（自己申告として表示されます）">
          <textarea className="input" rows={2} maxLength={500} value={v.selfDeclaredFeatures} onChange={(e) => set("selfDeclaredFeatures", e.target.value)} placeholder="皮がやわらかめ、減農薬で栽培 など" />
        </L>
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="大きさ">
            <select className="input" value={v.sizeLabel} onChange={(e) => set("sizeLabel", e.target.value)}>
              <option value="">指定しない</option>
              {SIZE_LABELS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </L>
          <L label="形・傷などの状態">
            <input className="input" maxLength={200} value={v.conditionNote} onChange={(e) => set("conditionNote", e.target.value)} placeholder="一部に小さな擦れあり" />
          </L>
        </div>
      </section>

      {/* 写真 */}
      <section className="card flex flex-col gap-4">
        <h2 className="section-title">📸 実物写真（必須）</h2>
        {mode !== "new" && <p className="hint">{mode === "republish" ? "再公開では、今の状態を撮り直した写真が必要です。" : "複製でも、今回販売する野菜の写真を選んでください。"}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <label className="flex size-36 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-sprout bg-leaf-light/50 text-center text-sm text-leaf-dark">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="選んだ写真" className="size-full object-cover" />
            ) : (
              <span>
                <span className="block text-4xl" aria-hidden>
                  📷
                </span>
                写真を選ぶ
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPhoto(f);
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
          <div className="flex flex-1 flex-col gap-3">
            <L label="撮影日">
              <input type="date" className="input" value={v.photoTakenOn} onChange={(e) => set("photoTakenOn", e.target.value)} required />
            </L>
            <label className="flex items-start gap-2 rounded-2xl bg-leaf-light/60 p-3 text-sm">
              <input type="checkbox" checked={selfTaken} onChange={(e) => setSelfTaken(e.target.checked)} className="mt-1 size-4 accent-green-700" />
              <span>自分で撮った、販売する野菜の写真です（AIで作った画像は使えません）</span>
            </label>
          </div>
        </div>
      </section>

      {/* 数量・価格 */}
      <section className="card flex flex-col gap-4">
        <h2 className="section-title">⚖️ 数量と価格</h2>
        {mode === "republish" && (
          <p className="rounded-2xl bg-leaf-light px-3 py-2 text-sm">
            現在の残り：<strong>{currentAvailableKg}kg</strong>。販売可能量はこれ以下で入力します（最初の総量には戻りません）。
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <L label="単価（円/kg）">
            <input className="input" inputMode="numeric" value={v.unitPriceYenPerKg} onChange={(e) => set("unitPriceYenPerKg", e.target.value)} required />
          </L>
          <L label={mode === "republish" ? "販売可能量（kg）" : "アプリ用の総量（kg）"} hint="市場などで売る分は含めない">
            <input className="input" inputMode="decimal" value={v.totalKg} onChange={(e) => set("totalKg", e.target.value)} required />
          </L>
          <L label="最低量（kg）">
            <input className="input" inputMode="decimal" value={v.minKg} onChange={(e) => set("minKg", e.target.value)} required />
          </L>
          <L label="注文単位（kg）">
            <input className="input" inputMode="decimal" value={v.stepKg} onChange={(e) => set("stepKg", e.target.value)} required />
          </L>
        </div>
        <p className="hint">申込できる量は「最低量＋注文単位×0以上の整数」です（例：最低1kg・単位0.5kgなら 1, 1.5, 2kg…）。kgは小数3桁まで。</p>
      </section>

      {/* 期限 */}
      <section className="card flex flex-col gap-4">
        <h2 className="section-title">⏰ 期限</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <L label="受付期限" hint="新しい申込を受け付ける最後の日時">
            <input type="datetime-local" className="input" value={v.acceptDeadlineAt} onChange={(e) => set("acceptDeadlineAt", e.target.value)} required />
          </L>
          <L label="回答の最終期限" hint="発送準備に間に合う合意の最終日時">
            <input type="datetime-local" className="input" value={v.responseDeadlineAt} onChange={(e) => set("responseDeadlineAt", e.target.value)} required />
          </L>
          <L label="回答猶予（時間）" hint="申込から回答までの時間">
            <select className="input" value={v.responseGraceHours} onChange={(e) => set("responseGraceHours", e.target.value)}>
              {["6", "12", "24", "48", "72"].map((h) => (
                <option key={h} value={h}>
                  {h}時間
                </option>
              ))}
            </select>
          </L>
        </div>
        <p className="hint">受付期限 ＜ 回答の最終期限 ＜ 最初の受け渡し日時 の順にしてください（日本時間）。</p>
      </section>

      {/* 受け渡し方法 */}
      {v.deliveryOptions.map((o, i) => (
        <section key={i} className="card flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title">
              {METHOD_EMOJI[o.method]} 受け渡し方法 {i + 1}
            </h2>
            {v.deliveryOptions.length > 1 && (
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={() => set("deliveryOptions", v.deliveryOptions.filter((_, j) => j !== i))}
              >
                削除
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <L label="方法">
              <select
                className="input"
                value={o.method}
                onChange={(e) => {
                  const m = e.target.value as Method;
                  setOption(i, m === "PICKUP" ? { method: m, rates: o.rates.map((r) => ({ ...r, feeYen: "0" })) } : { method: m });
                }}
              >
                {(Object.keys(DELIVERY_METHOD_LABELS) as Method[]).map((m) => (
                  <option key={m} value={m} disabled={m !== o.method && usedMethods.includes(m)}>
                    {DELIVERY_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </L>
            <L label="支払いのタイミング">
              <select className="input" value={o.paymentTiming} onChange={(e) => setOption(i, { paymentTiming: e.target.value as Option["paymentTiming"] })}>
                {Object.entries(PAYMENT_TIMING_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </L>
            <L label="支払方法（アプリ外）">
              <select className="input" value={o.paymentMethod} onChange={(e) => setOption(i, { paymentMethod: e.target.value as Option["paymentMethod"] })}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </L>
            {o.paymentTiming === "PREPAID" && (
              <L label="前払いの支払期限" hint="回答の最終期限より後、最初の受け渡しより前">
                <input type="datetime-local" className="input" value={o.prepayDeadlineAt} onChange={(e) => setOption(i, { prepayDeadlineAt: e.target.value })} />
              </L>
            )}
            <L label="入金確認の目安（時間）">
              <input className="input" inputMode="numeric" value={o.paymentConfirmGuideHours} onChange={(e) => setOption(i, { paymentConfirmGuideHours: e.target.value })} />
            </L>
          </div>

          {/* 送料表 */}
          <div className="rounded-2xl bg-leaf-light/40 p-3">
            <div className="label mb-2">💴 送料表（地域 × 数量帯）</div>
            <p className="hint mb-2">「〜kgを超え 〜kg以下」で、帯の抜け・重なりがないように。無料・引き取りは 0円 と入力します。</p>
            <div className="flex flex-col gap-2">
              {o.rates.map((r, j) => (
                <div key={j} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-white p-2 text-sm sm:grid-cols-[8rem_1fr_auto]">
                  <select
                    className="input py-1.5"
                    value={r.prefecture}
                    onChange={(e) => setOption(i, { rates: o.rates.map((x, k) => (k === j ? { ...x, prefecture: e.target.value } : x)) })}
                  >
                    {PREFECTURES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1">
                    <input className="input w-16 py-1.5" inputMode="decimal" value={r.minKg} onChange={(e) => setOption(i, { rates: o.rates.map((x, k) => (k === j ? { ...x, minKg: e.target.value } : x)) })} />
                    kg超〜
                    <input className="input w-16 py-1.5" inputMode="decimal" value={r.maxKg} onChange={(e) => setOption(i, { rates: o.rates.map((x, k) => (k === j ? { ...x, maxKg: e.target.value } : x)) })} />
                    kg以下
                    <input className="input w-20 py-1.5" inputMode="numeric" value={r.feeYen} disabled={o.method === "PICKUP"} onChange={(e) => setOption(i, { rates: o.rates.map((x, k) => (k === j ? { ...x, feeYen: e.target.value } : x)) })} />
                    円
                  </div>
                  <button type="button" aria-label="この帯を削除" className="row-start-1 text-red-600 sm:row-start-auto" onClick={() => setOption(i, { rates: o.rates.filter((_, k) => k !== j) })}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const last = o.rates.at(-1);
                  setOption(i, {
                    rates: [...o.rates, { prefecture: last?.prefecture ?? farmPrefecture, minKg: last?.maxKg ?? "0", maxKg: "", feeYen: o.method === "PICKUP" ? "0" : "" }],
                  });
                }}
              >
                ＋ 数量帯を追加
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setOption(i, { rates: [...o.rates, { prefecture: "大阪府", minKg: "0", maxKg: "", feeYen: o.method === "PICKUP" ? "0" : "" }] })}
              >
                ＋ 地域を追加
              </button>
            </div>
          </div>

          {/* 日程 */}
          <div className="rounded-2xl bg-leaf-light/40 p-3">
            <div className="label mb-2">📅 受け渡し日程</div>
            <div className="flex flex-col gap-2">
              {o.slots.map((s, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 text-sm">
                  <input type="datetime-local" className="input w-auto py-1.5" value={s.startsAt} onChange={(e) => setOption(i, { slots: o.slots.map((x, k) => (k === j ? { ...x, startsAt: e.target.value } : x)) })} />
                  〜
                  <input type="datetime-local" className="input w-auto py-1.5" value={s.endsAt} onChange={(e) => setOption(i, { slots: o.slots.map((x, k) => (k === j ? { ...x, endsAt: e.target.value } : x)) })} aria-label="終了（任意）" />
                  <input className="input w-24 py-1.5" inputMode="numeric" placeholder="件数上限" value={s.capacity} onChange={(e) => setOption(i, { slots: o.slots.map((x, k) => (k === j ? { ...x, capacity: e.target.value } : x)) })} aria-label="受付件数の上限（任意）" />
                  <button type="button" aria-label="この日程を削除" className="text-red-600" onClick={() => setOption(i, { slots: o.slots.filter((_, k) => k !== j) })}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="hint mt-1">終了時刻と件数上限は任意です。上限を入れると、回答待ち・確定の注文で枠を使います。</p>
            <button
              type="button"
              className="btn-secondary btn-sm mt-2"
              onClick={() => setOption(i, { slots: [...o.slots, { startsAt: o.slots.at(-1)?.startsAt ?? "", endsAt: "", capacity: "" }] })}
            >
              ＋ 日程を追加
            </button>
          </div>
        </section>
      ))}
      {v.deliveryOptions.length < 3 && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const m = (Object.keys(DELIVERY_METHOD_LABELS) as Method[]).find((x) => !usedMethods.includes(x))!;
            const base = v.deliveryOptions[0];
            set("deliveryOptions", [
              ...v.deliveryOptions,
              newOption(m, farmPrefecture, base?.paymentConfirmGuideHours ?? "24", base?.slots[0]?.startsAt ?? ""),
            ]);
          }}
        >
          ＋ 受け渡し方法を追加
        </button>
      )}

      <FormMessage message={clientError ?? state?.error} />
      <button type="submit" disabled={pending} className="btn-primary py-3 text-lg">
        {pending ? "公開しています…🌱" : mode === "republish" ? "🔁 確認して再公開する" : "🌾 確認して出品する"}
      </button>
    </form>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
