"use server";
// 仕入れの振り返り・ロス記録の保存（飲食店本人だけ。注文・在庫・評価には影響しない）
import { refresh } from "next/cache";
import type { ActionResult } from "@/components/action-button";
import { saveLossRecord, type LossChoice } from "@/lib/domain/loss";
import { formatKg } from "@/lib/domain/units";
import { allowAction, RATE_LIMIT_MESSAGE, requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function saveLossAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("RESTAURANT");
  if (!(await allowAction(user.id, "loss", 30, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const raw = String(formData.get("choice") ?? "");
  let choice: LossChoice;
  if (raw === "IN_USE") choice = { kind: "IN_USE" };
  else if (/^R[0-4]$/.test(raw)) choice = { kind: "RATIO", quarters: Number(raw[1]) };
  else if (raw === "DIRECT") choice = { kind: "DIRECT", wasteKg: String(formData.get("wasteKg") ?? "") };
  else return { ok: false, error: "当てはまるものを1つ選んでください" };
  const r = await saveLossRecord(prisma, {
    orderId,
    userId: user.id,
    choice,
    receivedKg: String(formData.get("receivedKg") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  refresh();
  if (!r.ok) return r;
  return {
    ok: true,
    message:
      r.wasteGrams === null
        ? "「まだ使用中」として保存しました（振り返りは未完了です）"
        : `保存しました：受取量${formatKg(r.receivedGrams)}中、${choice.kind === "RATIO" && choice.quarters !== 0 ? "約" : ""}${formatKg(r.wasteGrams)}を廃棄`,
  };
}
