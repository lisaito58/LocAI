"use client";
// 農家の条件変更（数量の減少・受け渡し日時・送料のみ。1回だけ）
import { useState } from "react";
import { proposeChangeAction } from "@/app/actions/orders";
import { ActionButton } from "@/components/action-button";

export function ChangeForm({
  orderId,
  currentKg,
  currentSlotId,
  slots,
}: {
  orderId: string;
  currentKg: string;
  currentSlotId: string;
  slots: { id: string; label: string; disabled: boolean }[];
}) {
  const [useException, setUseException] = useState(false);
  return (
    <ActionButton
      action={proposeChangeAction.bind(null, orderId)}
      className="btn-secondary btn-sm self-start"
      confirmText="この条件変更を店に送りますか？（変更案は1回だけです）"
      fields={
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="label">数量（kg・減らすことだけできます）</span>
            <input name="quantityKg" className="input" inputMode="decimal" defaultValue={currentKg} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">受け渡し日時</span>
            <select name="scheduleSlotId" className="input" defaultValue={currentSlotId}>
              {slots.map((s) => (
                <option key={s.id} value={s.id} disabled={s.disabled}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="useException" checked={useException} onChange={(e) => setUseException(e.target.checked)} className="size-4 accent-green-700" />
            送料表と違う送料にする（例外）
          </label>
          {useException && (
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <input name="exceptionFeeYen" className="input" inputMode="numeric" placeholder="送料（円）" />
              <input name="exceptionReason" className="input" maxLength={200} placeholder="理由（必須）" />
            </div>
          )}
          <p className="hint">単価・食材・数量の増加は変更できません。合計はサーバーで計算し直し、減らした分の仮押さえはすぐに解除されます。期限は延長されません。</p>
        </div>
      }
    >
      📝 この条件で変更を提案する
    </ActionButton>
  );
}
