#!/usr/bin/env node
/**
 * Prismaのマイグレーションをフラット化してWrangler D1用に準備するスクリプト
 *
 * Prisma: prisma/migrations/TIMESTAMP_name/migration.sql
 * D1:     prisma/migrations_flat/TIMESTAMP_name.sql
 */

const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS_DIR = "prisma/migrations";
const FLAT_DIR = "prisma/migrations_d1";
const MIGRATION_DIR_PATTERN = /^\d{14}_/;

/**
 * マイグレーションをフラット化
 */
function flattenMigrations() {
  console.log("🚀 Flattening Prisma migrations for Wrangler D1...\n");

  // フラットディレクトリを作成（既存の場合はクリア）
  if (fs.existsSync(FLAT_DIR)) {
    console.log(`🗑️  Clearing existing ${FLAT_DIR}/`);
    fs.rmSync(FLAT_DIR, { recursive: true });
  }
  fs.mkdirSync(FLAT_DIR, { recursive: true });

  // マイグレーションディレクトリが存在しない場合はエラー
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(
      `❌ Error: Migrations directory not found: ${MIGRATIONS_DIR}`
    );
    process.exit(1);
  }

  // マイグレーションディレクトリを読み取り
  const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => MIGRATION_DIR_PATTERN.test(entry.name)) // タイムスタンプで始まるディレクトリのみ
    .sort(); // タイムスタンプ順にソート

  if (migrations.length === 0) {
    console.warn("⚠️  No migrations found to flatten");
    return;
  }

  console.log(`📂 Found ${migrations.length} migration(s):\n`);

  // 各マイグレーションをコピー
  let successCount = 0;
  for (const migration of migrations) {
    const sourceFile = path.join(
      MIGRATIONS_DIR,
      migration.name,
      "migration.sql"
    );
    const destFile = path.join(FLAT_DIR, `${migration.name}.sql`);

    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, destFile);
      console.log(`   ✅ ${migration.name}`);
      successCount++;
    } else {
      console.warn(`   ⚠️  ${migration.name} (migration.sql not found)`);
    }
  }

  console.log(
    `\n✨ Successfully flattened ${successCount}/${migrations.length} migrations to ${FLAT_DIR}/`
  );
}

// 実行
try {
  flattenMigrations();
} catch (error) {
  console.error("❌ Failed to flatten migrations:", error.message);
  process.exit(1);
}
