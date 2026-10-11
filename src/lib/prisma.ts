// アプリから使う Prisma Client（サーバー側専用）
import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  // アプリは接続プーリングを通す接続文字列を使う
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// 開発中の再読み込みで接続が増え続けないようにする
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
