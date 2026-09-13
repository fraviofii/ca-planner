-- CreateTable
CREATE TABLE "PlanMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "itemId" TEXT,
    "day" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanMatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PlanItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanMatch_transactionId_key" ON "PlanMatch"("transactionId");

-- CreateIndex
CREATE INDEX "PlanMatch_itemId_day_idx" ON "PlanMatch"("itemId", "day");
