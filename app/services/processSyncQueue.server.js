import {
  getPendingSyncItems,
  markSyncItemSuccess,
  markSyncItemFailed,
  refreshSyncJobStatus,
} from "./syncQueue.server";

import { upsertShopifyProduct } from "./shopifyProduct.server";
import { syncPrice } from "./shopifyPrice.server";
import { syncInventory } from "./shopifyInventory.server";

export async function processSyncQueueBatch({ admin, jobId, limit = 10 }) {
  const items = await getPendingSyncItems(jobId, limit);

  const results = [];

  for (const queueItem of items) {
    const item = queueItem.payload;

    try {
      const shopifyProduct = await upsertShopifyProduct(admin, item);

      await syncPrice(admin, {
        productId: shopifyProduct.productId,
        variantId: shopifyProduct.variantId,
        price: item.price,
      });

      await syncInventory(admin, {
        inventoryItemId: shopifyProduct.inventoryItemId,
        quantity: item.available ?? item.quantity ?? 0,
      });

      await markSyncItemSuccess(queueItem.id);

      results.push({
        sku: item.sku,
        status: "success",
      });
    } catch (error) {
      await markSyncItemFailed(queueItem.id, error);

      results.push({
        sku: item.sku,
        status: "failed",
        error: error.message,
      });
    }
  }

  const job = await refreshSyncJobStatus(jobId);

  return {
    job,
    processed: items.length,
    results,
  };
}