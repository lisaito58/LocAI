"use client";
// 注文前の案内：同じ食材の直近の振り返りで、受取量の半分以上を廃棄していた場合だけ表示する
// 注文を禁止したり、量を勝手に減らしたりしない。「この量で申し込む」を押すと、いつもの申込フォームを表示する
import { useState, type ReactNode } from "react";

export function LossNotice({
  receivedOn,
  daysAgo,
  receivedText,
  wasteText,
  approximate,
  children,
}: {
  receivedOn: string;
  daysAgo: number;
  receivedText: string;
  wasteText: string;
  approximate: boolean;
  children: ReactNode;
}) {
  const [proceed, setProceed] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  if (proceed) return <>{children}</>;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-[#e9d3c0] bg-[#fbf0e6] p-4 text-[#3d3a37]">
      <p className="font-bold">前回、この食材は購入量の半分以上を廃棄した記録があります。今回の注文量を確認しますか？</p>
      {showRecord && (
        <dl className="grid gap-1 rounded-xl bg-white/80 p-3 text-sm">
          <div>
            <dt className="inline font-bold">受取日：</dt>
            <dd className="inline">
              {receivedOn}（{daysAgo}日前）
            </dd>
          </div>
          <div>
            <dt className="inline font-bold">受取量：</dt>
            <dd className="inline">{receivedText}</dd>
          </div>
          <div>
            <dt className="inline font-bold">廃棄量：</dt>
            <dd className="inline">
              {wasteText}
              {approximate && "（概算）"}
            </dd>
          </div>
          <p className="mt-1 text-gray-700">あなたが記録した過去の振り返りです。今回も同じになるとは限りません。</p>
        </dl>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => setShowRecord(!showRecord)} className="btn-secondary w-full sm:w-auto" aria-expanded={showRecord}>
          {showRecord ? "前回の記録を閉じる" : "前回の記録を見る"}
        </button>
        <button type="button" onClick={() => setProceed(true)} className="btn-primary w-full sm:w-auto">
          この量で申し込む
        </button>
      </div>
      <p className="text-sm">数量を変える場合は、上の「購入する量」を変えて「合計と期限を確認する」を押してください。</p>
    </div>
  );
}
