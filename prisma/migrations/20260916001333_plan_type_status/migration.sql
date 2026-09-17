-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startDay" DATETIME NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'NONE',
    "endDay" DATETIME,
    "categoryId" TEXT,
    "accountId" TEXT,
    "paymentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlanItem" ("accountId", "amountCents", "categoryId", "createdAt", "description", "endDay", "id", "notes", "recurrence", "startDay", "updatedAt") SELECT "accountId", "amountCents", "categoryId", "createdAt", "description", "endDay", "id", "notes", "recurrence", "startDay", "updatedAt" FROM "PlanItem";
DROP TABLE "PlanItem";
ALTER TABLE "new_PlanItem" RENAME TO "PlanItem";
CREATE INDEX "PlanItem_startDay_idx" ON "PlanItem"("startDay");
CREATE TABLE "new_PlanItemException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "amountCents" INTEGER,
    "categoryId" TEXT,
    "accountId" TEXT,
    "paymentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanItemException_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PlanItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanItemException_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanItemException_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlanItemException" ("accountId", "amountCents", "categoryId", "createdAt", "day", "description", "id", "itemId", "notes", "skipped", "updatedAt") SELECT "accountId", "amountCents", "categoryId", "createdAt", "day", "description", "id", "itemId", "notes", "skipped", "updatedAt" FROM "PlanItemException";
DROP TABLE "PlanItemException";
ALTER TABLE "new_PlanItemException" RENAME TO "PlanItemException";
CREATE UNIQUE INDEX "PlanItemException_itemId_day_key" ON "PlanItemException"("itemId", "day");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
