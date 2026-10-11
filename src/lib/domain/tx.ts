// トランザクションと共通の結果型
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// 業務ルール違反。トランザクションを取り消して、利用者向けの文言を返す
export class DomainError extends Error {}

export function fail(message: string): never {
  throw new DomainError(message);
}

// 失敗として返すが、それまでの変更（期限切れの反映など）は確定させたいときに使う
const SOFT = Symbol("softFail");
export type SoftFail = { [SOFT]: string };
export function softFail(message: string): SoftFail {
  return { [SOFT]: message };
}

export async function runTx<T extends object>(db: Db, fn: (tx: Tx) => Promise<T | SoftFail>): Promise<Result<T>> {
  try {
    const value = await db.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
    if (SOFT in value) return { ok: false, error: value[SOFT] };
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}

// 信頼できる時刻として DB の現在時刻を使う（クライアントの時刻は使わない）
export async function dbNow(tx: Tx | Db): Promise<Date> {
  const rows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return rows[0].now;
}

// 行ロック。同じ出品への操作は、ここで順番待ちになる
export async function lockListing(tx: Tx, listingId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Listing" WHERE id = ${listingId} FOR UPDATE`;
  if (rows.length === 0) fail("出品が見つかりません");
}

export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

export async function lockSlot(tx: Tx, slotId: string) {
  await tx.$queryRaw`SELECT id FROM "ScheduleSlot" WHERE id = ${slotId} FOR UPDATE`;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
