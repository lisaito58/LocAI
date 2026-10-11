// 現在のログイン利用者を読む（サーバー側専用）
import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  role: "RESTAURANT" | "FARMER";
};

// 画面に必要な最小限の情報だけを返す
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, role } = session.user;
  if (role !== "RESTAURANT" && role !== "FARMER") return null;
  return { id, name, role };
}
