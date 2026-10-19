"use client";
// 出品フォーム（新規・複製・再公開）を3ステップに分ける
//   1. 野菜について（写真・食材名・状態・販売総量）
//   2. 販売条件（単価・最低量・注文単位・期限・受け渡し方法・支払い・送料・日程）
//   3. 確認して公開
// 最後のステップ以外では公開しない。戻っても入力は残る。各ステップで必要な入力を確認し、公開時はサーバーで全体を検証する。
// 入力途中の内容はこのブラウザに下書き保存する（写真ファイルは保存できないので、復元時に選び直しを案内する）。
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { submitListing } from "@/app/actions/listings";
import { FieldError, FormMessage } from "@/app/form-parts";
import { ReqMark } from "@/components/fields";
import { useHasStored } from "@/components/use-stored-flag";
import { kgTextToGrams } from "@/lib/domain/units";
import {
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TIMING_LABELS,
  PREFECTURES,
  SIZE_LABELS,
} from "@/lib/validation/listing";
import type { ListingDraft, ListingFormProps, Method, Option } from "./listing-defaults";
import { METHOD_EMOJI, newOption } from "./listing-defaults";

const STEPS = ["野菜について", "販売条件", "確認して公開"] as const;
type Errors = Record<string, string>;

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

const isInt = (s: string, min: number, max: number) => /^\d+$/.test(s.trim()) && Number(s) >= min && Number(s) <= max;
const isKg = (s: string) => kgTextToGrams(s) !== null;

// 各ステップで必要な入力の確認（同じ内容をサーバーでも必ず検証する）
function validateStep(step: number, v: ListingDraft, photo: File | null, selfTaken: boolean): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (!photo) e.photo = "実物の写真を選んでください";
    if (!v.photoTakenOn) e.photoTakenOn = "撮影日を入力してください";
    if (!selfTaken) e.selfTaken = "自分で撮った販売する野菜の写真か、確認してチェックしてください";
    if (!v.itemName.trim()) e.itemName = "食材名を選ぶか入力してください";
    if (!v.totalKg.trim()) e.totalKg = "販売する量を入力してください";
    else if (!isKg(v.totalKg)) e.totalKg = "kgで、小数3桁までの数字で入力してください";
  }
  if (step === 1) {
    if (!isInt(v.unitPriceYenPerKg, 1, 100_000)) e.unitPriceYenPerKg = "単価を1〜100,000円の整数で入力してください";
    if (!isKg(v.minKg)) e.minKg = "最低量をkgの数字で入力してください";
    if (!isKg(v.stepKg)) e.stepKg = "注文単位をkgの数字で入力してください";
    if (!v.acceptDeadlineAt) e.acceptDeadlineAt = "受付期限を入力してください";
    if (!v.responseDeadlineAt) e.responseDeadlineAt = "回答の最終期限を入力してください";
    if (v.acceptDeadlineAt && v.responseDeadlineAt && v.acceptDeadlineAt >= v.responseDeadlineAt) {
      e.responseDeadlineAt = "回答の最終期限は、受付期限より後にしてください";
    }
    v.deliveryOptions.forEach((o, i) => {
      if (o.paymentTiming === "PREPAID" && !o.prepayDeadlineAt) e[`o${i}.prepay`] = "前払いの支払期限を入力してください";
      if (!isInt(o.paymentConfirmGuideHours, 1, 336)) e[`o${i}.confirm`] = "1〜336の整数で入力してください";
      if (o.method !== "PICKUP") {
        if (o.rates.length === 0) e[`o${i}.rates`] = "送料（無料の場合は0円）を1行以上入力してください";
        if (o.rates.some((r) => !isKg(r.minKg) || !isKg(r.maxKg) || !isInt(r.feeYen, 0, 100_000))) {
          e[`o${i}.rates`] = "送料表の数量（kg）と送料（円の整数）をすべて入力してください";
        }
      }
      if (o.slots.length === 0 || o.slots.some((s) => !s.startsAt)) e[`o${i}.slots`] = "受け渡し日時を1つ以上入力してください";
      if (v.responseDeadlineAt && o.slots.some((s) => s.startsAt && s.startsAt <= v.responseDeadlineAt)) {
        e[`o${i}.slots`] = "受け渡し日時は、回答の最終期限より後にしてください";
      }
    });
    if (v.earlySale && !v.saleTargetAt) e.saleTargetAt = "販売希望期限を入力してください";
    if (v.earlySale && v.saleTargetAt && v.responseDeadlineAt && v.saleTargetAt > v.responseDeadlineAt) {
      e.saleTargetAt = "販売希望期限は、回答の最終期限以前にしてください（それより後には合意できません）";
    }
  }
  return e;
}

export function ListingForm({ mode, sourceId, initial, farmPrefecture, currentAvailableKg, farmItems }: ListingFormProps) {
  const draftKey = `locai:listing-draft:${mode}:${sourceId ?? ""}`;
  const [v, setV] = useState<ListingDraft>(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [restored, setRestored] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selfTaken, setSelfTaken] = useState(false);
  const [state, dispatch, pending] = useActionState(submitListing, undefined);
  const [clientError, setClientError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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

  // ステップを移ったら見出しへ移動（スマホでも今どこか分かるように）
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const set = <K extends keyof ListingDraft>(k: K, value: ListingDraft[K]) => {
    setTouched(true);
    setV((p) => ({ ...p, [k]: value }));
  };
  const setOption = (i: number, patch: Partial<Option>) => {
    setTouched(true);
    setV((p) => ({ ...p, deliveryOptions: p.deliveryOptions.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  };

  function next() {
    const e = validateStep(step, v, photo, selfTaken);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep(step + 1);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Enterキーなどで送信されても、最後のステップ以外では公開しない
    if (step < 2) return next();
    setClientError(null);
    for (const s of [0, 1]) {
      const errs = validateStep(s, v, photo, selfTaken);
      if (Object.keys(errs).length) {
        setErrors(errs);
        setStep(s);
        return;
      }
    }
    let blob: Blob;
    try {
      blob = await resizeImage(photo!);
    } catch {
      setStep(0);
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
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {/* 進み具合 */}
      <div className="card flex flex-col gap-3 p-4">
        <p className="text-sm font-bold text-gray-700">出品まで3ステップ</p>
        <ol className="grid grid-cols-3 gap-2">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 text-center text-sm font-bold ${
                i === step ? "border-leaf bg-leaf text-white" : i < step ? "border-leaf bg-leaf-light text-leaf-dark" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              <span>{i < step ? "✓ 済" : `${i + 1}`}</span>
              <span className="leading-tight">{label}</span>
            </li>
          ))}
        </ol>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-leaf-dark outline-none">
          {step + 1}／3：{STEPS[step]}
        </h2>
      </div>

      {hasDraft && !restored && !touched && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950">
          📝 このブラウザに入力途中の下書きがあります。
          <button type="button" onClick={restoreDraft} className="btn-secondary btn-sm">
            下書きを復元する
          </button>
        </div>
      )}
      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          📝 下書きを復元しました。写真は保存されないため、もう一度選んでください。期限・数量も今回の値か確認してください。
          <button type="button" onClick={clearDraft} className="btn-secondary btn-sm">
            下書きを消す
          </button>
        </div>
      )}

      {/* ---------- 1. 野菜について ---------- */}
      {step === 0 && (
        <>
          <section className="card flex flex-col gap-4">
            <h3 className="section-title">📸 実物の写真</h3>
            {mode !== "new" && (
              <p className="hint">{mode === "republish" ? "再公開では、今の状態を撮り直した写真が必要です。" : "複製でも、今回販売する野菜の写真を選んでください。"}</p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex flex-col gap-1">
                <span className="label">
                  写真
                  <ReqMark required />
                </span>
                <label className="flex size-40 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-leaf bg-leaf-light/50 text-center text-sm font-bold text-leaf-dark has-focus-visible:ring-4 has-focus-visible:ring-green-200">
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
                {preview && <span className="text-sm">写真をもう一度押すと選び直せます</span>}
                <FieldError errors={errors.photo ? [errors.photo] : undefined} />
              </div>
              <div className="flex flex-1 flex-col gap-3">
                <L label="撮影日" required error={errors.photoTakenOn}>
                  <input type="date" className="input" value={v.photoTakenOn} onChange={(e) => set("photoTakenOn", e.target.value)} />
                </L>
                <div className="flex flex-col gap-1">
                  <label className="flex min-h-11 items-start gap-2 rounded-2xl bg-leaf-light/60 p-3 text-sm">
                    <input type="checkbox" checked={selfTaken} onChange={(e) => setSelfTaken(e.target.checked)} className="mt-0.5 size-5 accent-green-700" />
                    <span>
                      自分で撮った、販売する野菜の写真です（AIで作った画像は使えません）
                      <ReqMark required />
                    </span>
                  </label>
                  <FieldError errors={errors.selfTaken ? [errors.selfTaken] : undefined} />
                </div>
              </div>
            </div>
          </section>

          <section className="card flex flex-col gap-4">
            <h3 className="section-title">🥬 野菜</h3>
            <ItemPicker value={v.itemName} items={farmItems} onChange={(x) => set("itemName", x)} error={errors.itemName} />
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="大きさ" optional>
                <select className="input" value={v.sizeLabel} onChange={(e) => set("sizeLabel", e.target.value)}>
                  <option value="">指定しない</option>
                  {SIZE_LABELS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </L>
              <L label="形・傷などの状態" optional>
                <input className="input" maxLength={200} value={v.conditionNote} onChange={(e) => set("conditionNote", e.target.value)} placeholder="例：一部に小さな擦れあり" />
              </L>
            </div>
            {mode === "republish" && (
              <p className="rounded-2xl bg-leaf-light px-3 py-2 text-sm">
                現在の残り：<strong>{currentAvailableKg}kg</strong>。販売可能量はこれ以下で入力します（最初の総量には戻りません）。
              </p>
            )}
            <L
              label={mode === "republish" ? "販売可能量（kg）" : "このアプリで売る量（kg）"}
              required
              hint="市場などほかで売る分は含めません。例：30"
              error={errors.totalKg}
            >
              <input className="input" inputMode="decimal" value={v.totalKg} onChange={(e) => set("totalKg", e.target.value)} />
            </L>
            <details className="rounded-2xl border-2 border-green-100 p-3" open={Boolean(v.description || v.selfDeclaredFeatures)}>
              <summary className="cursor-pointer font-bold text-leaf-dark">＋ 説明・こだわり・余った理由などを追加する（任意）</summary>
              <div className="mt-3 flex flex-col gap-3">
                <L label="説明（公開）" optional hint="例：形が不揃いで市場に出せない分です。味は同じです。">
                  <textarea className="input" rows={3} maxLength={500} value={v.description} onChange={(e) => set("description", e.target.value)} />
                </L>
                <L label="特徴・こだわり（自己申告として表示）" optional>
                  <textarea className="input" rows={2} maxLength={500} value={v.selfDeclaredFeatures} onChange={(e) => set("selfDeclaredFeatures", e.target.value)} placeholder="例：皮がやわらかめ" />
                </L>
              </div>
            </details>
          </section>
        </>
      )}

      {/* ---------- 2. 販売条件 ---------- */}
      {step === 1 && (
        <>
          <section className="card flex flex-col gap-4">
            <h3 className="section-title">💴 値段と売る単位</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <L label="単価（円/kg）" required hint="1kgあたりの値段" error={errors.unitPriceYenPerKg}>
                <input className="input" inputMode="numeric" value={v.unitPriceYenPerKg} onChange={(e) => set("unitPriceYenPerKg", e.target.value)} />
              </L>
              <L label="最低注文量（kg）" required hint="これより少ない注文は受けない" error={errors.minKg}>
                <input className="input" inputMode="decimal" value={v.minKg} onChange={(e) => set("minKg", e.target.value)} />
              </L>
              <L label="注文単位（kg）" required hint="最低量に、この量ずつ足せる" error={errors.stepKg}>
                <input className="input" inputMode="decimal" value={v.stepKg} onChange={(e) => set("stepKg", e.target.value)} />
              </L>
            </div>
            <p className="hint">例：最低1kg・単位0.5kgなら、1kg・1.5kg・2kg…で申し込めます。</p>
          </section>

          <section className="card flex flex-col gap-4">
            <h3 className="section-title">⏰ 期限と返事の時間</h3>
            <L label="申し込みから何時間以内に返事しますか？" required hint="この時間内に「承認・条件変更・見送り」を選びます（回答猶予）">
              <select className="input" value={v.responseGraceHours} onChange={(e) => set("responseGraceHours", e.target.value)}>
                {["6", "12", "24", "48", "72"].map((h) => (
                  <option key={h} value={h}>
                    {h}時間以内
                  </option>
                ))}
              </select>
            </L>
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="新しい申し込みを受け付ける最後の日時" required hint="受付期限" error={errors.acceptDeadlineAt}>
                <input type="datetime-local" className="input" value={v.acceptDeadlineAt} onChange={(e) => set("acceptDeadlineAt", e.target.value)} />
              </L>
              <L label="発送準備に間に合う、返事の最終日時" required hint="回答の最終期限（受付期限より後）" error={errors.responseDeadlineAt}>
                <input type="datetime-local" className="input" value={v.responseDeadlineAt} onChange={(e) => set("responseDeadlineAt", e.target.value)} />
              </L>
            </div>
            <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-3">
              <label className="flex min-h-11 items-center gap-2 font-bold">
                <input type="checkbox" className="size-5 accent-green-700" checked={v.earlySale} onChange={(e) => set("earlySale", e.target.checked)} />
                ⏳ 早めに販売したい
                <ReqMark optional />
              </label>
              <p className="hint">
                お店の画面の「早めに販売したい野菜」に紹介されます。値下げは必要ありません。食べられる期限ではなく、「この日時までに販売を決めたい」という希望です。
              </p>
              {v.earlySale && (
                <div className="mt-2">
                  <L label="販売希望期限（この日時までに販売確定させたい）" required error={errors.saleTargetAt}>
                    <input type="datetime-local" className="input" value={v.saleTargetAt} onChange={(e) => set("saleTargetAt", e.target.value)} />
                  </L>
                  <p className="hint mt-1">回答の最終期限以前で、「いま＋返事の時間」より後にしてください。受付・回答・受け渡しの期限は変わりません。</p>
                </div>
              )}
            </div>
          </section>

          {v.deliveryOptions.map((o, i) => (
            <section key={i} className="card flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="section-title">
                  {METHOD_EMOJI[o.method]} 受け渡し方法 {i + 1}
                </h3>
                {v.deliveryOptions.length > 1 && (
                  <button type="button" className="btn-danger btn-sm" onClick={() => set("deliveryOptions", v.deliveryOptions.filter((_, j) => j !== i))}>
                    この方法を削除
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <L label="方法" required>
                  <select className="input" value={o.method} onChange={(e) => setOption(i, { method: e.target.value as Method })}>
                    {(Object.keys(DELIVERY_METHOD_LABELS) as Method[]).map((m) => (
                      <option key={m} value={m} disabled={m !== o.method && usedMethods.includes(m)}>
                        {DELIVERY_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="支払いのタイミング" required>
                  <select className="input" value={o.paymentTiming} onChange={(e) => setOption(i, { paymentTiming: e.target.value as Option["paymentTiming"] })}>
                    {Object.entries(PAYMENT_TIMING_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="支払方法（アプリの外で）" required>
                  <select className="input" value={o.paymentMethod} onChange={(e) => setOption(i, { paymentMethod: e.target.value as Option["paymentMethod"] })}>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </L>
                {o.paymentTiming === "PREPAID" && (
                  <L label="前払いの支払期限" required hint="返事の最終日時より後、最初の受け渡しより前" error={errors[`o${i}.prepay`]}>
                    <input type="datetime-local" className="input" value={o.prepayDeadlineAt} onChange={(e) => setOption(i, { prepayDeadlineAt: e.target.value })} />
                  </L>
                )}
                <L label="入金確認の目安（時間）" required hint="支払いの申告から何時間以内に確認するか" error={errors[`o${i}.confirm`]}>
                  <input className="input" inputMode="numeric" value={o.paymentConfirmGuideHours} onChange={(e) => setOption(i, { paymentConfirmGuideHours: e.target.value })} />
                </L>
              </div>

              {o.method === "PICKUP" ? (
                <p className="rounded-2xl bg-leaf-light/60 px-3 py-2 text-sm">🏡 引き取りは送料0円です。送料の入力はいりません。</p>
              ) : (
                <div className="rounded-2xl bg-leaf-light/40 p-3">
                  <div className="label mb-1">
                    💴 送料（地域 × 数量帯）
                    <ReqMark required />
                  </div>
                  <p className="hint mb-2">「〜kgを超え 〜kg以下」で、帯の抜け・重なりがないようにします。無料なら 0円 と入力します。</p>
                  <div className="flex flex-col gap-2">
                    {o.rates.map((r, j) => {
                      const upd = (patch: Partial<typeof r>) => setOption(i, { rates: o.rates.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
                      return (
                        <fieldset key={j} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 text-sm">
                          <legend className="sr-only">送料 {j + 1}行目</legend>
                          <select aria-label="地域" className="input w-auto" value={r.prefecture} onChange={(e) => upd({ prefecture: e.target.value })}>
                            {PREFECTURES.map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                          <span className="flex flex-wrap items-center gap-1">
                            <input aria-label="下限（kg）" className="input w-20" inputMode="decimal" value={r.minKg} onChange={(e) => upd({ minKg: e.target.value })} />
                            kg超〜
                            <input aria-label="上限（kg）" className="input w-20" inputMode="decimal" value={r.maxKg} onChange={(e) => upd({ maxKg: e.target.value })} />
                            kg以下
                            <input aria-label="送料（円）" className="input w-24" inputMode="numeric" value={r.feeYen} onChange={(e) => upd({ feeYen: e.target.value })} />
                            円
                          </span>
                          <button type="button" className="btn-danger btn-sm" onClick={() => setOption(i, { rates: o.rates.filter((_, k) => k !== j) })}>
                            この行を削除
                          </button>
                        </fieldset>
                      );
                    })}
                  </div>
                  <FieldError errors={errors[`o${i}.rates`] ? [errors[`o${i}.rates`]] : undefined} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const last = o.rates.at(-1);
                        setOption(i, { rates: [...o.rates, { prefecture: last?.prefecture ?? farmPrefecture, minKg: last?.maxKg ?? "0", maxKg: "", feeYen: "" }] });
                      }}
                    >
                      ＋ 数量帯を追加
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setOption(i, { rates: [...o.rates, { prefecture: "大阪府", minKg: "0", maxKg: "", feeYen: "" }] })}>
                      ＋ 地域を追加
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-leaf-light/40 p-3">
                <div className="label mb-1">
                  📅 受け渡し日程
                  <ReqMark required />
                </div>
                <div className="flex flex-col gap-2">
                  {o.slots.map((s, j) => {
                    const upd = (patch: Partial<typeof s>) => setOption(i, { slots: o.slots.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
                    return (
                      <fieldset key={j} className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-2 text-sm">
                        <legend className="sr-only">日程 {j + 1}</legend>
                        <label className="flex flex-col">
                          <span>開始</span>
                          <input type="datetime-local" className="input w-auto" value={s.startsAt} onChange={(e) => upd({ startsAt: e.target.value })} />
                        </label>
                        <label className="flex flex-col">
                          <span>終了（任意）</span>
                          <input type="datetime-local" className="input w-auto" value={s.endsAt} onChange={(e) => upd({ endsAt: e.target.value })} />
                        </label>
                        <label className="flex flex-col">
                          <span>受付件数の上限（任意）</span>
                          <input className="input w-28" inputMode="numeric" value={s.capacity} onChange={(e) => upd({ capacity: e.target.value })} />
                        </label>
                        <button type="button" className="btn-danger btn-sm" onClick={() => setOption(i, { slots: o.slots.filter((_, k) => k !== j) })}>
                          この日程を削除
                        </button>
                      </fieldset>
                    );
                  })}
                </div>
                <FieldError errors={errors[`o${i}.slots`] ? [errors[`o${i}.slots`]] : undefined} />
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
                set("deliveryOptions", [...v.deliveryOptions, newOption(m, farmPrefecture, base?.paymentConfirmGuideHours ?? "24", base?.slots[0]?.startsAt ?? "")]);
              }}
            >
              ＋ 受け渡し方法を追加
            </button>
          )}
        </>
      )}

      {/* ---------- 3. 確認して公開 ---------- */}
      {step === 2 && (
        <section className="card flex flex-col gap-4">
          <div className="flex gap-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="出品する野菜の写真" className="size-28 shrink-0 rounded-2xl object-cover" />
            )}
            <div>
              <p className="text-xl font-bold">{v.itemName}</p>
              <p>
                {mode === "republish" ? "販売可能量" : "売る量"} {v.totalKg}kg ・ {v.unitPriceYenPerKg}円/kg
              </p>
              <p className="text-sm text-gray-700">
                最低{v.minKg}kg・{v.stepKg}kg単位 ・ 返事は申し込みから{v.responseGraceHours}時間以内
              </p>
            </div>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Row k="受付期限" v={v.acceptDeadlineAt.replace("T", " ")} />
            <Row k="回答の最終期限" v={v.responseDeadlineAt.replace("T", " ")} />
            <Row k="早めに販売したい" v={v.earlySale ? `はい（販売希望期限 ${v.saleTargetAt.replace("T", " ")}）` : "いいえ"} />
            {v.sizeLabel && <Row k="大きさ" v={v.sizeLabel} />}
            {v.conditionNote && <Row k="状態" v={v.conditionNote} />}
          </dl>
          {v.deliveryOptions.map((o, i) => (
            <div key={i} className="rounded-2xl bg-leaf-light/50 p-3 text-sm">
              <p className="font-bold">
                {METHOD_EMOJI[o.method]} {DELIVERY_METHOD_LABELS[o.method]} ・ {PAYMENT_TIMING_LABELS[o.paymentTiming]}（{PAYMENT_METHOD_LABELS[o.paymentMethod]}）
              </p>
              {o.paymentTiming === "PREPAID" && <p>支払期限 {o.prepayDeadlineAt.replace("T", " ")}</p>}
              <p>
                送料：
                {o.method === "PICKUP" ? "0円（引き取り）" : o.rates.map((r) => `${r.prefecture} ${r.minKg}〜${r.maxKg}kg ${r.feeYen}円`).join("／")}
              </p>
              <p>日程：{o.slots.map((s) => s.startsAt.replace("T", " ")).join("、")}</p>
            </div>
          ))}
          <p className="hint">公開後の価格の変更は、新しい申し込みだけに使われます。すでに届いた購入希望の条件は変わりません。</p>
        </section>
      )}

      <FormMessage message={clientError ?? state?.error} />

      {/* 戻る／次へ／公開する */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 rounded-3xl bg-white/95 p-2 shadow-[0_-4px_16px_-8px_rgb(0_0_0/0.25)] md:bottom-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary flex-1">
            ← 戻る
          </button>
        )}
        {step < 2 ? (
          <button type="button" onClick={next} className="btn-primary flex-[2]">
            次へ：{STEPS[step + 1]} →
          </button>
        ) : (
          <button type="submit" disabled={pending} className="btn-primary flex-[2] py-3 text-lg">
            {pending ? "公開しています…🌱" : mode === "republish" ? "🔁 この内容で再公開する" : "🌾 この内容で公開する"}
          </button>
        )}
      </div>
    </form>
  );
}

// 食材名：農園情報の登録品目から選ぶか、直接入力する（未登録の野菜も出品できる）
function ItemPicker({ value, items, onChange, error }: { value: string; items: string[]; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="label">
          食材名（品種も書けます）
          <ReqMark required />
        </span>
        <input
          className="input"
          list={items.length ? "farm-items" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={50}
          placeholder={items.length ? "登録した品目から選ぶか、直接入力" : "例：賀茂茄子"}
          aria-invalid={Boolean(error) || undefined}
        />
        {items.length > 0 && (
          <datalist id="farm-items">
            {items.map((it) => (
              <option key={it} value={it} />
            ))}
          </datalist>
        )}
      </label>
      {items.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">農園情報の品目から選ぶ（文字を入れると絞り込めます。その他は直接入力）：</span>
          <div className="flex flex-wrap gap-2">
            {items
              .filter((it) => !value || it.includes(value) || value.includes(it))
              .slice(0, 12)
              .map((it) => (
                <button
                  key={it}
                  type="button"
                  aria-pressed={value === it}
                  onClick={() => onChange(it)}
                  className={`min-h-10 rounded-full border-2 px-3 text-sm font-bold ${value === it ? "border-leaf bg-leaf text-white" : "border-green-200 bg-white text-leaf-dark"}`}
                >
                  {value === it && "✓ "}
                  {it}
                </button>
              ))}
          </div>
        </div>
      ) : (
        <span className="hint">農園情報の「主な品目」に登録すると、ここで選べるようになります。</span>
      )}
      <FieldError errors={error ? [error] : undefined} />
    </div>
  );
}

function L({ label, hint, required, optional, error, children }: { label: string; hint?: string; required?: boolean; optional?: boolean; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        <ReqMark required={required} optional={optional} />
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      <FieldError errors={error ? [error] : undefined} />
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-green-100">
      <dt className="text-gray-700">{k}</dt>
      <dd className="font-bold">{v}</dd>
    </div>
  );
}
