"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useKeepForm } from "@/components/use-keep-form";
import { generateIntroDraft, saveFarmerProfile } from "@/app/actions/profile";
import { FormMessage } from "@/app/form-parts";
import { Field, PrefectureSelect, TextInput } from "@/components/fields";
import { WEEKDAYS } from "@/lib/validation/profile";

type Initial = {
  farmName: string;
  prefecture: string;
  city: string;
  addressLine: string;
  contactPhone: string;
  mainItems: string;
  commitment: string;
  introduction: string;
  responseGuide: string;
  availableWeekdays: string[];
  paymentConfirmGuideHours: number;
} | null;

export function FarmerProfileForm({ initial }: { initial: Initial }) {
  const [state, onSubmit, pending] = useKeepForm(saveFarmerProfile);
  const e = state?.fieldErrors;
  const formRef = useRef<HTMLFormElement>(null);
  const [intro, setIntro] = useState(initial?.introduction ?? "");
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();

  function requestDraft() {
    const fd = new FormData(formRef.current!);
    const get = (k: string) => String(fd.get(k) ?? "");
    setDraftError(null);
    startDraft(async () => {
      // 本人が入力した公開用の項目だけを送る（住所・電話番号は送らない）
      const r = await generateIntroDraft({
        farmName: get("farmName"),
        prefecture: get("prefecture"),
        city: get("city"),
        mainItems: get("mainItems"),
        commitment: get("commitment"),
      });
      if (r?.draft) setDraft(r.draft);
      else setDraftError(r?.error ?? "下書きを作れませんでした");
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4">
        <h2 className="section-title">🌾 公開する情報</h2>
        <Field label="農園名（デモでは架空の名前）" errors={e?.farmName}>
          <TextInput name="farmName" defaultValue={initial?.farmName} required maxLength={50} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="都道府県" errors={e?.prefecture}>
            <PrefectureSelect name="prefecture" defaultValue={initial?.prefecture ?? "京都府"} />
          </Field>
          <Field label="市区町村" errors={e?.city}>
            <TextInput name="city" defaultValue={initial?.city} required maxLength={30} placeholder="南丹市" />
          </Field>
        </div>
        <Field label="主な品目" errors={e?.mainItems}>
          <TextInput name="mainItems" defaultValue={initial?.mainItems} maxLength={100} placeholder="賀茂茄子、万願寺唐辛子" />
        </Field>
        <Field label="栽培のこだわり（自己申告として表示）" errors={e?.commitment}>
          <textarea name="commitment" defaultValue={initial?.commitment} maxLength={300} rows={3} className="input" />
        </Field>

        <div className="rounded-2xl border-2 border-dashed border-sprout/60 bg-leaf-light/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label">🤖 AIで紹介文の下書きを作る（任意）</span>
            <button type="button" onClick={requestDraft} disabled={drafting} className="btn-secondary btn-sm">
              {drafting ? "作成中…🌱" : "✨ 下書きを作る"}
            </button>
          </div>
          <p className="hint mt-1">
            送るのは上の「農園名・地域・主な品目・こだわり」だけです。住所・電話番号・写真は送りません。
          </p>
          {draftError && <p className="mt-2 text-sm text-red-700">⚠️ {draftError}</p>}
          {draft && (
            <div className="mt-3 rounded-2xl bg-white p-3 text-sm">
              <p className="hint mb-1">AIの下書き（まだ公開されていません）</p>
              <p className="whitespace-pre-wrap">{draft}</p>
              <button type="button" className="btn-primary btn-sm mt-2" onClick={() => setIntro(draft)}>
                ⬇️ 紹介文の欄に入れて編集する
              </button>
            </div>
          )}
        </div>

        <Field label="紹介文（確認・修正してから保存すると公開されます）" errors={e?.introduction}>
          <textarea
            name="introduction"
            value={intro}
            onChange={(ev) => setIntro(ev.target.value)}
            maxLength={500}
            rows={5}
            className="input"
          />
        </Field>
        <Field label="回答の目安（参考表示）" hint="例：当日の夕方までに返信します" errors={e?.responseGuide}>
          <TextInput name="responseGuide" defaultValue={initial?.responseGuide} maxLength={50} />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="label">回答できる曜日（参考表示）</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label key={d} className="badge cursor-pointer bg-leaf-light px-3 py-1.5 text-sm has-checked:bg-leaf has-checked:text-white">
                <input
                  type="checkbox"
                  name="availableWeekdays"
                  value={d}
                  defaultChecked={initial?.availableWeekdays.includes(d)}
                  className="sr-only"
                />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="section-title">🔒 取引相手にだけ表示する情報</h2>
        <Field label="詳細住所" errors={e?.addressLine}>
          <TextInput name="addressLine" defaultValue={initial?.addressLine} required maxLength={100} />
        </Field>
        <Field label="電話番号" errors={e?.contactPhone}>
          <TextInput name="contactPhone" defaultValue={initial?.contactPhone} required inputMode="tel" />
        </Field>
        <Field
          label="入金確認の目安（時間）"
          hint="店の支払申告から何時間以内に確認するかの目安。出品の初期値になり、注文時の値が注文に保存されます。"
          errors={e?.paymentConfirmGuideHours}
        >
          <TextInput
            name="paymentConfirmGuideHours"
            type="number"
            min={1}
            max={336}
            defaultValue={initial?.paymentConfirmGuideHours ?? 24}
          />
        </Field>
      </section>

      <FormMessage message={state?.message} tone={state?.ok ? "ok" : "error"} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "保存しています…" : "💾 保存する"}
      </button>
      {(state?.ok || initial) && (
        <Link href="/farm" className="btn-secondary">
          🌾 出品一覧へ
        </Link>
      )}
    </form>
  );
}
