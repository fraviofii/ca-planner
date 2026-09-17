/**
 * Aplica as migrações do Prisma sem o CLI.
 *
 * No app empacotado não existe `npx`, nem `node_modules`, nem o pacote `prisma` — só os
 * .sql que vieram junto. Então este módulo faz o que o `prisma migrate deploy` faria:
 * roda em ordem as migrações que ainda não estão no banco e grava a mesma escrituração
 * em `_prisma_migrations` (o checksum é o sha256 do arquivo, igual ao do Prisma), para o
 * `prisma migrate` do desenvolvimento continuar entendendo o mesmo banco.
 */
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const BOOKKEEPING = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/**
 * @param {string} dbFile caminho do arquivo .db (criado se não existir)
 * @param {string} migrationsDir pasta com as subpastas de migração do Prisma
 * @returns {string[]} nomes das migrações aplicadas agora
 */
function applyMigrations(dbFile, migrationsDir) {
  if (!fs.existsSync(migrationsDir)) throw new Error(`Migrações não encontradas em ${migrationsDir}.`);
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  // As migrações de SQLite recriam tabelas para mudar colunas; com as chaves
  // estrangeiras ligadas isso falharia no meio. O Prisma também as desliga aqui.
  const db = new DatabaseSync(dbFile, { enableForeignKeyConstraints: false });
  try {
    db.exec(BOOKKEEPING);
    const done = new Set(
      db.prepare(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).all().map((r) => r.migration_name),
    );

    const pending = fs
      .readdirSync(migrationsDir)
      .filter((name) => fs.existsSync(path.join(migrationsDir, name, "migration.sql")))
      .sort()
      .filter((name) => !done.has(name));

    const applied = [];
    for (const name of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      db.exec("BEGIN");
      try {
        db.exec(sql);
        db.prepare(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES (?, ?, current_timestamp, ?, current_timestamp, 1)`,
        ).run(crypto.randomUUID(), crypto.createHash("sha256").update(sql).digest("hex"), name);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw new Error(`Migração ${name} falhou: ${e.message}`);
      }
      applied.push(name);
    }
    return applied;
  } finally {
    db.close();
  }
}

module.exports = { applyMigrations };
