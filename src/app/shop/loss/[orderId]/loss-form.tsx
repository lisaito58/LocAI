"use client";
// ボタン式のロス記録。保存前に「受取量2kg中、約1kgを廃棄」のように確認できる（計算はサーバーでも行う）
import { useState } from "react";
import { saveLossAction } from "@/app/actions/loss";
import { ActionButton } from "@/components/action-button";
import { ReqMark } from "@/components/fields";
import { RATIO_CHOICES, wasteFromRatio } from "@/lib/domain/loss-rules";
import { formatKg, kgTextToGrams } from "@/lib/domain/units";

export function LossForm({ orderId, receivedGrams, initialChoice }: { orderId: string; receivedGrams: number; initialChoice: string }) {
  const [choice, setChoice] = useState(initialChoice);
  const [wasteKg, setWasteKg] = useState("");
  const [receivedKg, setReceivedKg] = useState("");
  const received = (receivedKg.trim() && kgTextToGrams(receivedKg)) || receivedGrams;

  let preview = "";
  if (choice === "IN_USE") preview = "まだ使用中として保存します（振り返りは未完了。ロス0とは数えません）";
  else if (/^R[0-4]$/.test(choice)) {
    const q = Number(choice[1]);
    preview = q === 0 ? `受取量${formatKg(received)}中、廃棄なし` : `受取量${formatKg(received)}中、約${formatKg(wasteFromRatio(received, q))}を廃棄（概算）`;
  } else if (choice === "DIRECT") {
    const g = kgTextToGrams(wasteKg);
    preview = g === null ? "廃棄量をkgで入力してください" : g > received ? "⚠️ 廃棄量が受取量を超えています" : `受取量${formatKg(received)}中、${formatKg(g)}を廃棄`;
  }

  return (
    <ActionButton
      action={saveLossAction.bind(null, orderId)}
      className="btn-primary w-full"
      fields={
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="label mb-1">
              この食材はどうなりましたか？
              <ReqMark required />
            </legend>
            {[...RATIO_CHOICES.map((c) => ({ v: `R${c.q}`, label: c.label })), { v: "IN_USE", label: "まだ使用中" }, { v: "DIRECT", label: "数量を直接入力する" }].map((o) => (
              <label
                key={o.v}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-green-200 bg-white px-3 py-2 font-bold has-checked:border-leaf has-checked:bg-leaf-light has-focus-visible:ring-4 has-focus-visible:ring-green-200"
              >
                <input type="radio" name="choice" value={o.v} checked={choice === o.v} onChange={() => setChoice(o.v)} className="size-5 accent-green-700" />
                {o.label}
              </label>
            ))}
          </fieldset>
          {choice === "DIRECT" && (
            <label className="flex flex-col gap-1">
              <span className="label">
                廃棄した量（kg）
                <ReqMark required />
              </span>
              <input name="wasteKg" className="input" inputMode="decimal" value={wasteKg} onChange={(e) => setWasteKg(e.target.value)} placeholder="例：0.8" />
            </label>
          )}
          <details className="rounded-xl border border-green-200 p-3">
            <summary className="cursor-pointer font-bold">実際の受取量が注文と違った場合</summary>
            <label className="mt-2 flex flex-col gap-1">
              <span className="label">
                実際の受取量（kg）
                <ReqMark optional />
              </span>
              <input name="receivedKg" className="input" inputMode="decimal" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)} placeholder={`空欄なら ${formatKg(receivedGrams)}（注文の数量）`} />
              <span className="hint">振り返りの計算だけに使います。注文の内容は変わりません。</span>
            </label>
          </details>
          <label className="flex flex-col gap-1">
            <span className="label">
              理由・メモ
              <ReqMark optional />
            </span>
            <input name="reason" className="input" maxLength={200} placeholder="例：雨で来客が少なかった" />
          </label>
          {preview && (
            <p role="status" className="rounded-xl bg-leaf-light px-3 py-2 font-bold">
              確認：{preview}
            </p>
          )}
        </div>
      }
    >
      💾 この内容で保存する
    </ActionButton>
  );
}
