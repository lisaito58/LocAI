"use client";
import { useEffect, useRef } from "react";
import { saveRestaurantProfile } from "@/app/actions/profile";
import { FormMessage } from "@/app/form-parts";
import { AddressFields } from "@/components/address-fields";
import { Field, TextInput } from "@/components/fields";
import { markDirty } from "@/components/logout-button";
import { PhoneField } from "@/components/phone-field";
import { useKeepForm } from "@/components/use-keep-form";

type Initial = { shopName: string; prefecture: string; city: string; addressLine: string; contactPhone: string; postalCode: string } | null;

export function RestaurantProfileForm({ initial }: { initial: Initial }) {
  const [state, onSubmit, pending] = useKeepForm(saveRestaurantProfile);
  const e = state?.fieldErrors;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && formRef.current) formRef.current.dataset.dirty = "false";
  }, [state]);
  return (
    <form ref={formRef} onSubmit={onSubmit} onChange={markDirty} data-dirty-label="店舗情報" className="card flex flex-col gap-4">
      <Field label="店名（デモでは架空の名前）" required errors={e?.shopName}>
        <TextInput name="shopName" defaultValue={initial?.shopName} required maxLength={50} />
      </Field>
      <AddressFields
        initial={{ prefecture: initial?.prefecture ?? "大阪府", city: initial?.city, addressLine: initial?.addressLine, postalCode: initial?.postalCode }}
        errors={e}
        prefectureHint="配送先の地域として、送料の計算に使います"
        addressHint="🔒 番地・建物名と電話番号は、販売確定した取引の相手だけに表示されます。すでに確定した注文の届け先は変わりません。"
      />
      <PhoneField label="🔒 電話番号" defaultValue={initial?.contactPhone} serverErrors={e?.contactPhone} />
      <FormMessage message={state?.message} tone={state?.ok ? "ok" : "error"} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "保存しています…" : "💾 店舗情報を保存する"}
      </button>
    </form>
  );
}
