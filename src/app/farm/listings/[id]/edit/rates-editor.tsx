"use client";
// 送料表の編集（受け渡し方法ごと）。府県ごとに開閉でき、重量帯を追加・修正する。
// 帯は「〜kgを超え 〜kg以下」。重なり・抜けはサーバーで確認する。送料が未設定の地域は申し込めない（0円にはならない）。
import { useState } from "react";
import { saveShippingRatesAction } from "@/app/actions/listings";
import { ActionButton } from "@/components/action-button";
import { SERVICE_PREFECTURES } from "@/lib/validation/listing";

type Row = { prefecture: string; minKg: string; maxKg: string; feeYen: string };

export function RatesEditor({ listingId, optionId, initial, defaultPrefecture }: { listingId: string; optionId: string; initial: Row[]; defaultPrefecture: string }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [adding, setAdding] = useState("");
  const [opened, setOpened] = useState<string[]>([]); // 開いている府県（追加した地域は開いた状態にする）
  const upd = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const set = SERVICE_PREFECTURES.filter((p) => rows.some((r) => r.prefecture === p));
  const missing = SERVICE_PREFECTURES.filter((p) => !rows.some((r) => r.prefecture === p));
  const addPick = adding || missing[0] || defaultPrefecture;

  function addBand(prefecture: string) {
    const last = rows.filter((r) => r.prefecture === prefecture).at(-1);
    setRows([...rows, { prefecture, minKg: last?.maxKg ?? "0", maxKg: "", feeYen: "" }]);
  }
  function removeRow(i: number) {
    const r = rows[i];
    const what = `${r.prefecture}・${r.minKg || "?"}kg超〜${r.maxKg || "?"}kg以下（${r.feeYen === "" ? "送料未入力" : `${r.feeYen}円`}）`;
    if (window.confirm(`「${what}」の行を削除しますか？\n（「この送料表を保存する」を押すまで保存はされません）`)) setRows(rows.filter((_, j) => j !== i));
  }

  return (
    <ActionButton
      action={saveShippingRatesAction.bind(null, listingId, optionId)}
      className="btn-primary w-full sm:w-auto sm:self-start"
      fields={
        <div className="flex flex-col gap-3">
          <input type="hidden" name="rates" value={JSON.stringify(rows)} />
          {rows.length === 0 && <p className="text-sm">送料が1行もありません。下から配送先の地域を追加してください。</p>}
          {set.map((pref) => {
            const items = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.prefecture === pref);
            return (
              <details
                key={pref}
                open={opened.includes(pref)}
                onToggle={(e) => {
                  const isOpen = e.currentTarget.open;
                  setOpened((o) => (isOpen ? [...new Set([...o, pref])] : o.filter((x) => x !== pref)));
                }}
                className="rounded-xl bg-white ring-1 ring-green-100"
              >
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-bold">
                  {pref}：{items.length}つの重量帯を設定済み
                  <span className="ml-auto text-sm text-leaf-dark">{opened.includes(pref) ? "▲ 閉じる" : "▼ 開く"}</span>
                </summary>
                <div className="flex flex-col gap-2 px-3 pb-3">
                  {items.map(({ r, i }, n) => (
                    <fieldset key={i} className="flex flex-col gap-2 rounded-xl bg-leaf-light/40 p-3">
                      <legend className="sr-only">
                        {pref} {n + 1}つ目の重量帯
                      </legend>
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
                      <button type="button" className="btn-danger btn-sm self-start" onClick={() => removeRow(i)}>
                        この重量帯を削除
                      </button>
                    </fieldset>
                  ))}
                  <button type="button" className="btn-secondary btn-sm self-start" onClick={() => addBand(pref)}>
                    ＋ {pref}の重量帯を追加
                  </button>
                </div>
              </details>
            );
          })}
          {missing.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-green-200 p-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1">
                <span className="label">配送先の地域を追加</span>
                <select className="input" value={addPick} onChange={(e) => setAdding(e.target.value)}>
                  {missing.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setRows([...rows, { prefecture: addPick, minKg: "0", maxKg: "", feeYen: "" }]);
                  setOpened((o) => [...new Set([...o, addPick])]);
                  setAdding("");
                }}
              >
                ＋ 地域を追加
              </button>
            </div>
          )}
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
