"use client";
import Link from "next/link";
import { useKeepForm } from "@/components/use-keep-form";
import { saveRestaurantProfile } from "@/app/actions/profile";
import { FormMessage } from "@/app/form-parts";
import { Field, PrefectureSelect, TextInput } from "@/components/fields";

type Initial = { shopName: string; prefecture: string; city: string; addressLine: string; contactPhone: string } | null;

export function RestaurantProfileForm({ initial }: { initial: Initial }) {
  const [state, onSubmit, pending] = useKeepForm(saveRestaurantProfile);
  const e = state?.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4">
      <Field label="店名（デモでは架空の名前）" errors={e?.shopName}>
        <TextInput name="shopName" defaultValue={initial?.shopName} required maxLength={50} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="都道府県（配送先の地域）" errors={e?.prefecture}>
          <PrefectureSelect name="prefecture" defaultValue={initial?.prefecture ?? "大阪府"} />
        </Field>
        <Field label="市区町村" errors={e?.city}>
          <TextInput name="city" defaultValue={initial?.city} required maxLength={30} placeholder="大阪市福島区" />
        </Field>
      </div>
      <Field label="🔒 詳細住所（確定後に取引相手だけへ表示）" errors={e?.addressLine}>
        <TextInput name="addressLine" defaultValue={initial?.addressLine} required maxLength={100} />
      </Field>
      <Field label="🔒 電話番号（確定後に取引相手だけへ表示）" errors={e?.contactPhone}>
        <TextInput name="contactPhone" defaultValue={initial?.contactPhone} required inputMode="tel" placeholder="06-0000-0000" />
      </Field>
      <FormMessage message={state?.message} tone={state?.ok ? "ok" : "error"} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "保存しています…" : "💾 保存する"}
      </button>
      {(state?.ok || initial) && (
        <Link href="/shop/search" className="btn-secondary">
          🔍 野菜をさがしに行く
        </Link>
      )}
    </form>
  );
}
