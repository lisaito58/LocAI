"use client";
import { editListing, type ListingFormState } from "@/app/actions/listings";
import { FormMessage } from "@/app/form-parts";
import { Field } from "@/components/fields";
import { useKeepForm } from "@/components/use-keep-form";

export function ListingEditForm({
  listingId,
  initial,
}: {
  listingId: string;
  initial: { unitPriceYenPerKg: number; totalKg: string; description: string; selfDeclaredFeatures: string; conditionNote: string };
}) {
  const [state, onSubmit, pending] = useKeepForm<ListingFormState>(editListing.bind(null, listingId));
  const e = state?.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field label="単価（円/kg）" errors={e?.unitPriceYenPerKg}>
          <input name="unitPriceYenPerKg" className="input" inputMode="numeric" defaultValue={initial.unitPriceYenPerKg} />
        </Field>
        <Field label="出品総量（kg）" hint="確定量＋仮押さえ量 未満にはできません" errors={e?.totalKg}>
          <input name="totalKg" className="input" inputMode="decimal" defaultValue={initial.totalKg} />
        </Field>
      </div>
      <Field label="説明" errors={e?.description}>
        <textarea name="description" className="input" rows={2} maxLength={500} defaultValue={initial.description} />
      </Field>
      <Field label="特徴（自己申告）" errors={e?.selfDeclaredFeatures}>
        <textarea name="selfDeclaredFeatures" className="input" rows={2} maxLength={500} defaultValue={initial.selfDeclaredFeatures} />
      </Field>
      <Field label="状態" errors={e?.conditionNote}>
        <input name="conditionNote" className="input" maxLength={200} defaultValue={initial.conditionNote} />
      </Field>
      <p className="hint">変更は新しい申込にだけ使われます。すでに届いている注文は、申込時の条件のままです。</p>
      <FormMessage message={state?.error} />
      {state && !state.error && !state.fieldErrors && <FormMessage tone="ok" message="保存しました" />}
      <button type="submit" disabled={pending} className="btn-primary btn-sm self-start">
        {pending ? "保存中…" : "💾 変更を保存"}
      </button>
    </form>
  );
}
