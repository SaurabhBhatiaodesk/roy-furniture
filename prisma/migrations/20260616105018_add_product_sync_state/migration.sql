-- CreateTable
CREATE TABLE "ProductSyncState" (
    "sku" TEXT NOT NULL PRIMARY KEY,
    "lastUpdatedByVendor" TEXT,
    "syncedAt" DATETIME NOT NULL
);
