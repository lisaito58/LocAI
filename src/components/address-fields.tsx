"use client";
// 住所の入力：都道府県 → その都道府県の市区町村を一覧から選ぶ → 番地・建物名
// 都道府県を変えたら、合わない市区町村は残さない。一覧にない既存の値は選び直しを案内する。
import { useState } from "react";
import { FieldError } from "@/app/form-parts";
import { PrefectureSelect, ReqMark } from "@/components/fields";
import { MUNICIPALITIES } from "@/lib/data/municipalities";

export function AddressFields({
  initial,
  errors,
  prefectureLabel = "都道府県",
  addressLabel = "番地・建物名",
  addressHint,
  showAddressLine = true,
}: {
  initial?: { prefecture?: string; city?: string; addressLine?: string };
  errors?: Record<string, string[] | undefined>;
  prefectureLabel?: string;
  addressLabel?: string;
  addressHint?: string;
  showAddressLine?: boolean;
}) {
  const [prefecture, setPrefecture] = useState(initial?.prefecture ?? "");
  const cities = MUNICIPALITIES[prefecture] ?? [];
  const initialCityValid = Boolean(initial?.city && cities.includes(initial.city));
  const [city, setCity] = useState(initialCityValid ? initial!.city! : "");
  const staleCity = initial?.city && !initialCityValid && prefecture === initial?.prefecture ? initial.city : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">
            {prefectureLabel}
            <ReqMark required />
          </span>
          <PrefectureSelect
            name="prefecture"
            value={prefecture}
            onChange={(v) => {
              setPrefecture(v);
              if (!(MUNICIPALITIES[v] ?? []).includes(city)) setCity("");
            }}
          />
          <FieldError errors={errors?.prefecture} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">
            市区町村
            <ReqMark required />
          </span>
          <select
            name="city"
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={!prefecture}
            required
            aria-invalid={Boolean(errors?.city) || undefined}
          >
            <option value="" disabled>
              {prefecture ? "選んでください" : "先に都道府県を選んでください"}
            </option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {staleCity && !city && (
            <span className="text-sm text-amber-900">
              登録済みの「{staleCity}」は一覧にない表記です。一覧から選び直してください（郡がある町村は「〇〇郡〇〇町」と表示されます）。
            </span>
          )}
          <FieldError errors={errors?.city} />
        </label>
      </div>
      {showAddressLine && (
        <label className="flex flex-col gap-1">
          <span className="label">
            {addressLabel}
            <ReqMark required />
          </span>
          <input name="addressLine" className="input" defaultValue={initial?.addressLine} required maxLength={100} placeholder="例：福島1-2-3 みかんビル1階" />
          {addressHint && <span className="hint">{addressHint}</span>}
          <FieldError errors={errors?.addressLine} />
        </label>
      )}
    </div>
  );
}
