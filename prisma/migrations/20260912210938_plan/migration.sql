-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startDay" DATETIME NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'NONE',
    "endDay" DATETIME,
    "categoryId" TEXT,
    "accountId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanItemException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "amountCents" INTEGER,
    "categoryId" TEXT,
    "accountId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanItemException_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PlanItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanItemException_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanItemException_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlanItem_startDay_idx" ON "PlanItem"("startDay");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItemException_itemId_day_key" ON "PlanItemException"("itemId", "day");
