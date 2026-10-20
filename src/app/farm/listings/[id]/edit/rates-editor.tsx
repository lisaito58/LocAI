"use client";
// 送料表の編集（受け渡し方法ごと）。地域・重量帯ごとの送料を一覧で確認し、追加・修正する。
// 帯は「〜kgを超え 〜kg以下」。重なり・抜けはサーバーで確認する。送料が未設定の地域は申し込めない（0円にはならない）。
import { useState } from "react";
import { saveShippingRatesAction } from "@/app/actions/listings";
import { ActionButton } from "@/components/action-button";
import { SERVICE_PREFECTURES } from "@/lib/validation/listing";

type Row = { prefecture: string; minKg: string; maxKg: string; feeYen: string };

export function RatesEditor({ listingId, optionId, initial, defaultPrefecture }: { listingId: string; optionId: string; initial: Row[]; defaultPrefecture: string }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const upd = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const missing = SERVICE_PREFECTURES.filter((p) => !rows.some((r) => r.prefecture === p));
  return (
    <ActionButton
      action={saveShippingRatesAction.bind(null, listingId, optionId)}
      className="btn-primary w-full sm:w-auto sm:self-start"
      fields={
        <div className="flex flex-col gap-3">
          <input type="hidden" name="rates" value={JSON.stringify(rows)} />
          {rows.length === 0 && <p className="text-sm">送料が1行もありません。行を追加してください。</p>}
          {rows.map((r, i) => (
            <fieldset key={i} className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-green-100">
              <legend className="sr-only">送料 {i + 1}行目</legend>
              <label className="flex flex-col gap-1">
                <span className="label">地域</span>
                <select className="input" value={r.prefecture} onChange={(e) => upd(i, { prefecture: e.target.value })}>
                  {SERVICE_PREFECTURES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <div className="grid items-start gap-2 min-[420px]:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="label">〜kgを超え</span>
                  <input className="input" inputMode="decimal" value={r.minKg} onChange={(e) => upd(i, { minKg: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="label">〜kg以下</span>
                  <input className="input" inputMode="decimal" value={r.maxKg} onChange={(e) => upd(i, { maxKg: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="label">送料（円）</span>
                  <input className="input" inputMode="numeric" value={r.feeYen} onChange={(e) => upd(i, { feeYen: e.target.value })} placeholder="無料なら0" />
                </label>
              </div>
              <button type="button" className="btn-danger btn-sm self-start" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                この行を削除
              </button>
            </fieldset>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                const last = rows.at(-1);
                setRows([...rows, { prefecture: last?.prefecture ?? defaultPrefecture, minKg: last?.maxKg ?? "0", maxKg: "", feeYen: "" }]);
              }}
            >
              ＋ 重量帯を追加
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRows([...rows, { prefecture: missing[0] ?? defaultPrefecture, minKg: "0", maxKg: "", feeYen: "" }])}>
              ＋ 地域を追加
            </button>
          </div>
          {missing.length > 0 && (
            <p className="text-sm">
              送料が未設定の地域：{missing.join("・")}（この地域のお店は申し込めず、相談だけになります。無料にする場合は0円で登録してください）
            </p>
          )}
          <p className="hint">送料の変更は新しい申し込みにだけ使われます。届いている購入希望・確定注文は、申し込んだときの送料のままです。</p>
        </div>
      }
    >
      💾 この送料表を保存する
    </ActionButton>
  );
}
