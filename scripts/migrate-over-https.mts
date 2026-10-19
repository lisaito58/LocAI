// 未適用のマイグレーションを、HTTPS（WebSocket）経由で適用する
// ネットワークの都合で 5432 番ポートに直接つながらず `prisma migrate deploy` が使えない環境向け。
// 実行：npm run migrate:https          … 適用予定を表示するだけ（変更しない）
//       npm run migrate:https -- --apply … 実際に適用する
// `prisma migrate deploy` と同じく、_prisma_migrations に名前と SHA-256 を記録する。
// 1つのマイグレーションは1つのトランザクションで適用し、失敗したら何も変更しない。
import "./load-env";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";

const apply = process.argv.includes("--apply");
const dir = "prisma/migrations";

const applied = await prisma.$queryRaw<{ migration_name: string; checksum: string }[]>`
  SELECT migration_name::text, checksum::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
const appliedMap = new Map(applied.map((m) => [m.migration_name, m.checksum]));

const names = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let pending = 0;
for (const name of names) {
  const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const known = appliedMap.get(name);
  if (known) {
    if (known !== checksum) {
      console.error(`⚠️ ${name} は適用済みですが、ファイルの内容が変わっています。中止します。`);
      process.exit(1);
    }
    continue;
  }
  pending++;
  // 文字列リテラルにセミコロンを含まない、Prisma が生成した SQL を前提に、文ごとに分ける
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  if (/\bDROP\s|\bTRUNCATE\s|\bDELETE\s+FROM\b|\bALTER\s+COLUMN\b/i.test(sql)) {
    console.error(`⚠️ ${name} に削除系の文が含まれています。このスクリプトでは適用しません。`);
    process.exit(1);
  }
  console.log(`${apply ? "適用します" : "未適用"}：${name}（${statements.length}文）`);
  if (!apply) continue;
  const startedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const st of statements) await tx.$executeRawUnsafe(st);
    await tx.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${randomUUID()}, ${checksum}, now(), ${name}, NULL, NULL, ${startedAt}, 1)`;
  });
  console.log(`✅ ${name} を適用しました`);
}
if (pending === 0) console.log("未適用のマイグレーションはありません");
else if (!apply) console.log("\n確認のみです。適用するには npm run migrate:https -- --apply");
process.exit(0);
