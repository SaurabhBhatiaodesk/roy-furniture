CREATE TABLE "FurnitureWizardOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FurnitureWizardOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FurnitureWizardOrder_shop_shopifyOrderId_key"
ON "FurnitureWizardOrder"("shop", "shopifyOrderId");

CREATE INDEX "FurnitureWizardOrder_status_idx"
ON "FurnitureWizardOrder"("status");
