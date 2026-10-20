"use client";
// 出品の基本情報の編集。変更は新しい申し込みにだけ使われる（届いている購入希望・確定注文の条件は変わらない）
import { editListing, type ListingFormState } from "@/app/actions/listings";
import { FormMessage } from "@/app/form-parts";
import { Field } from "@/components/fields";
import { useKeepForm } from "@/components/use-keep-form";
import { SIZE_LABELS } from "@/lib/validation/listing";

export function ListingEditForm({
  listingId,
  initial,
}: {
  listingId: string;
  initial: { unitPriceYenPerKg: number; totalKg: string; description: string; selfDeclaredFeatures: string; conditionNote: string; sizeLabel: string };
}) {
  const [state, onSubmit, pending] = useKeepForm<ListingFormState>(editListing.bind(null, listingId));
  const e = state?.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label="単価（円/kg）" required errors={e?.unitPriceYenPerKg}>
          <input name="unitPriceYenPerKg" className="input" inputMode="numeric" defaultValue={initial.unitPriceYenPerKg} />
        </Field>
        <Field label="出品総量（kg）" required hint="販売確定と仮押さえの合計より少なくはできません" errors={e?.totalKg}>
          <input name="totalKg" className="input" inputMode="decimal" defaultValue={initial.totalKg} />
        </Field>
        <Field label="大きさ" optional>
          <select name="sizeLabel" className="input" defaultValue={initial.sizeLabel}>
            <option value="">指定しない</option>
            {SIZE_LABELS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="形・傷などの状態" optional errors={e?.conditionNote}>
          <input name="conditionNote" className="input" maxLength={200} defaultValue={initial.conditionNote} />
        </Field>
      </div>
      <Field label="説明" optional errors={e?.description}>
        <textarea name="description" className="input" rows={3} maxLength={500} defaultValue={initial.description} />
      </Field>
      <Field label="特徴・こだわり（自己申告）" optional errors={e?.selfDeclaredFeatures}>
        <textarea name="selfDeclaredFeatures" className="input" rows={2} maxLength={500} defaultValue={initial.selfDeclaredFeatures} />
      </Field>
      <p className="hint">変更は新しい申し込みにだけ使われます。すでに届いている購入希望や販売確定した注文の価格・条件は変わりません。</p>
      <FormMessage message={state?.error} />
      {state?.message && <FormMessage tone="ok" message={state.message} />}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto sm:self-start">
        {pending ? "保存しています…" : "💾 基本情報を保存する"}
      </button>
    </form>
  );
}
