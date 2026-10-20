"use client";
// お試し販売の設定（野菜ごと・任意）。数量・価格は農家が決める。在庫は通常販売と共通
import { useState } from "react";
import Link from "next/link";
import { saveTrialSettingsAction } from "@/app/actions/listings";
import { ActionButton } from "@/components/action-button";
import { ReqMark } from "@/components/fields";

export function TrialSettings({
  listingId,
  initial,
  dailyLimit,
}: {
  listingId: string;
  initial: { enabled: boolean; setKg: string; priceYen: string; count: string };
  dailyLimit: number | null;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  return (
    <ActionButton
      action={saveTrialSettingsAction.bind(null, listingId)}
      className="btn-primary w-full sm:w-auto sm:self-start"
      fields={
        <div className="flex flex-col gap-3">
          <p className="hint">
            はじめてのお店が、通常の注文の前に少量を試せる仕組みです（無料配布ではありません）。お試しも承認制で、在庫は通常販売と共通です。受け渡し方法・送料表・日程・期限は、この出品の設定を使います。
          </p>
          <label className="flex min-h-11 items-center gap-2 font-bold">
            <input type="checkbox" name="trialEnabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-5 accent-green-700" />
            お試し販売を受け付ける
          </label>
          {enabled && (
            <div className="grid items-start gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="label">
                  1セットの数量（kg）
                  <ReqMark required />
                </span>
                <input name="trialSetKg" className="input" inputMode="decimal" defaultValue={initial.setKg} placeholder="例：0.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">
                  1セットの商品価格（円）
                  <ReqMark required />
                </span>
                <input name="trialPriceYen" className="input" inputMode="numeric" defaultValue={initial.priceYen} placeholder="例：500" />
                <span className="hint">送料は別に送料表から計算します</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">
                  用意するセット数
                  <ReqMark required />
                </span>
                <input name="trialCount" className="input" inputMode="numeric" defaultValue={initial.count} placeholder="例：5" />
              </label>
            </div>
          )}
          <p className="text-sm">
            1日に準備・発送・引き渡しできるお試しの件数：{dailyLimit === null ? "上限なし" : `${dailyLimit}件まで`}（受け渡し日ごと。
            <Link href="/farm/profile#trial" className="link">
              農園情報で変更
            </Link>
            ）
          </p>
        </div>
      }
    >
      💾 お試し販売の設定を保存する
    </ActionButton>
  );
}
