import { furnitureWizardCsvAdapter } from "./adapters/furnitureWizardCsvAdapter";
import { upsertShopifyProduct } from "./services/shopifyProduct.server";
import { syncInventory } from "./services/shopifyInventory.server";
import { syncPrice } from "./services/shopifyPrice.server";

export async function runFurnitureWizardCsvSync(admin, files) {
  const adapter = furnitureWizardCsvAdapter({
    webFormatContent: files.webFormatContent,
    branchSumContent: files.branchSumContent,
    inventoryExportContent: files.inventoryExportContent,
  });

  const { products, skippedRows, totalRows } = await adapter.getInventory();

  const results = [];

  for (const item of products) {
    try {
      const shopifyProduct = await upsertShopifyProduct(admin, item);

      await syncPrice(admin, {
        productId: shopifyProduct.productId,
        variantId: shopifyProduct.variantId,
        price: item.price,
      });

      await syncInventory(admin, {
        inventoryItemId: shopifyProduct.inventoryItemId,
        quantity: item.available ?? item.quantity,
      });

      results.push({
        sku: item.sku,
        status: "success",
        quantity: item.available ?? item.quantity,
      });
    } catch (error) {
      results.push({
        sku: item.sku,
        status: "failed",
        error: error.message,
      });
    }
  }

  return {
    totalRows,
    syncedProducts: results.length,
    skippedRows,
    results,
  };
}





// import { getFurnitureWizardProducts } from "./adapters/furnitureWizard.server";
// import { upsertShopifyProduct } from "./services/shopifyProduct.server";
// import { syncInventory } from "./services/shopifyInventory.server";
// import { syncPrice } from "./services/shopifyPrice.server";

// export async function runFullSync(admin) {
//   const products = await getFurnitureWizardProducts();

//   const results = [];

//   for (const item of products) {
//     try {
//       const shopifyProduct = await upsertShopifyProduct(admin, item);

//         await syncPrice(admin, {
//             productId: shopifyProduct.productId,
//             variantId: shopifyProduct.variantId,
//             price: item.price,
//         });

//       await syncInventory(admin, {
//         inventoryItemId: shopifyProduct.inventoryItemId,
//         quantity: item.available,
//       });

//       results.push({
//         sku: item.sku,
//         status: "success",
//       });
//     } catch (error) {
//       results.push({
//         sku: item.sku,
//         status: "failed",
//         error: error.message,
//       });
//     }
//   }

//   return results;
// }