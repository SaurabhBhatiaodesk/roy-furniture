/* global globalThis */
import { readFile, writeFile, stat, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import cron from "node-cron";
import { fetchCsvFromFtp } from "./ftpCsv.server.js";
import { branchSumCsvAdapter } from "../adapters/branchSumCsvAdapter.js";
import { runInventorySync } from "./inventorySync.js";
import { unauthenticated } from "../shopify.server.js";
import { getOfflineShopDomain } from "./shopSession.server.js";
import { retryPendingFurnitureWizardOrders } from "./orderCoordination.server.js";
import {
  buildSyncBatch,
  countTrackedProducts,
  loadProductSyncStateMap,
  markProductsSynced,
} from "./productSyncState.server.js";

const BATCH_SIZE = Number(process.env.CRON_SYNC_BATCH_SIZE || 250);
const CSV_CACHE_PATH = join(tmpdir(), "roy-furniture-inv-cache.csv");
const CSV_CACHE_TTL_MS = 60 * 60 * 1000;
const FRESH_CSV_EACH_RUN = process.env.CRON_SYNC_FRESH_CSV_EACH_RUN !== "false";

function getState() {
  if (!globalThis.__royFurnitureCron) {
    globalThis.__royFurnitureCron = {
      isRunning: false,
      lastRun: null,
      cachedProducts: null,
      cachedTotalRows: 0,
      loadPromise: null,
      cronTask: null,
      scheduled: false,
    };
  }

  return globalThis.__royFurnitureCron;
}

export function getLastCronRun() {
  return getState().lastRun;
}

export function getCronSyncProgress() {
  const state = getState();
  const lastRun = state.lastRun;

  return {
    batchSize: BATCH_SIZE,
    totalCsvProducts: state.cachedProducts?.length ?? 0,
    pendingChanges: lastRun?.progress?.pendingChanges ?? 0,
    pendingNew: lastRun?.progress?.pendingNew ?? 0,
    pendingUpdated: lastRun?.progress?.pendingUpdated ?? 0,
    trackedProducts: lastRun?.progress?.trackedProducts ?? 0,
    deltaOnly: true,
    freshCsvEachRun: FRESH_CSV_EACH_RUN,
  };
}

async function readCachedCsv() {
  try {
    const fileStat = await stat(CSV_CACHE_PATH);
    const ageMs = Date.now() - fileStat.mtimeMs;

    if (ageMs > CSV_CACHE_TTL_MS) {
      return null;
    }

    console.log(
      `[cron-sync] Using disk CSV cache (${(fileStat.size / 1024 / 1024).toFixed(2)} MB, ${Math.round(ageMs / 60000)} min old)`,
    );

    return readFile(CSV_CACHE_PATH, "utf8");
  } catch {
    return null;
  }
}

async function loadProductsFromFtp({ forceRefresh = false } = {}) {
  const state = getState();

  if (state.loadPromise) {
    console.log("[cron-sync] CSV load already in progress, waiting...");
    return state.loadPromise;
  }

  state.loadPromise = (async () => {
    if (forceRefresh) {
      state.cachedProducts = null;
      await unlink(CSV_CACHE_PATH).catch(() => {});
    }

    let fileContent = forceRefresh ? null : await readCachedCsv();

    if (!fileContent) {
      console.log("[cron-sync] Fetching InvAdvBranchSum.csv from SFTP...");
      fileContent = await fetchCsvFromFtp();
      await writeFile(CSV_CACHE_PATH, fileContent, "utf8");
      console.log("[cron-sync] CSV saved to disk cache for 1 hour");
    }

    console.log("[cron-sync] Parsing CSV...");
    const adapter = branchSumCsvAdapter({ fileContent });
    const result = await adapter.getInventory();

    state.cachedProducts = result.products;
    state.cachedTotalRows = result.totalRows;

    console.log(`[cron-sync] Parsed ${state.cachedProducts.length} products`);

    return result;
  })();

  try {
    return await state.loadPromise;
  } finally {
    state.loadPromise = null;
  }
}

function buildBatchAdapter(products, totalRows) {
  return {
    getInventory: async () => ({
      products,
      skippedRows: [],
      totalRows,
    }),
  };
}

export async function runCronSyncJob({ shop: preferredShop } = {}) {
  const state = getState();

  if (state.isRunning) {
    console.log("[cron-sync] Previous run still in progress, skipping.");
    return state.lastRun;
  }

  state.isRunning = true;
  const startedAt = new Date().toISOString();

  try {
    const shop = await getOfflineShopDomain(preferredShop);

    console.log(`[cron-sync] Using shop from session table: ${shop}`);

    const orderRetry = await retryPendingFurnitureWizardOrders();
    if (orderRetry.attempted > 0) {
      console.log(
        `[order-sync] Retried ${orderRetry.attempted} order(s): ${orderRetry.delivered} delivered, ${orderRetry.failed} failed`,
      );
    }

    await loadProductsFromFtp({ forceRefresh: FRESH_CSV_EACH_RUN });

    const totalCsvProducts = state.cachedProducts.length;

    if (totalCsvProducts === 0) {
      throw new Error("No valid products found in CSV");
    }

    const syncStateMap = await loadProductSyncStateMap();
    const {
      batch,
      pendingNew,
      pendingUpdated,
      pendingTotal,
    } = buildSyncBatch(state.cachedProducts, syncStateMap, BATCH_SIZE);
    const trackedProducts = await countTrackedProducts();

    console.log(
      `[cron-sync] Delta sync — ${pendingTotal} pending (${pendingNew} new, ${pendingUpdated} updated) of ${totalCsvProducts} CSV products (${trackedProducts} tracked)`,
    );

    if (batch.length === 0) {
      state.lastRun = {
        startedAt,
        completedAt: new Date().toISOString(),
        success: true,
        shop,
        report: {
          created: [],
          updated: [],
          skipped: [],
          failed: [],
        },
        progress: {
          totalCsvProducts,
          pendingChanges: 0,
          pendingNew: 0,
          pendingUpdated: 0,
          trackedProducts,
          processedThisRun: 0,
          deltaOnly: true,
        },
      };

      console.log("[cron-sync] No product changes detected (product data). ");

      if (trackedProducts >= totalCsvProducts) {
        state.cachedProducts = null;
        await unlink(CSV_CACHE_PATH).catch(() => {});
        console.log("[cron-sync] All products in sync — CSV cache cleared for next fetch.");
      }

      return state.lastRun;
    }

    const { admin } = await unauthenticated.admin(shop);

    const newInBatch = batch.filter((p) => !syncStateMap.has(p.sku)).length;

    console.log(
      `[cron-sync] Syncing ${batch.length} product(s) — ${newInBatch} new, ${batch.length - newInBatch} updated (${pendingTotal} pending total)...`,
    );

    const report = await runInventorySync({
      adapter: buildBatchAdapter(batch, state.cachedTotalRows),
      admin,
      offset: 0,
      limit: batch.length,
    });

    const syncedProducts = batch.filter(
      (product) =>
        !report.failed.some((failure) => failure.sku === "ALL" || failure.sku === product.sku),
    );

    if (syncedProducts.length > 0) {
      await markProductsSynced(syncedProducts);
    }

    const trackedAfterSync = await countTrackedProducts();
    const remaining = buildSyncBatch(
      state.cachedProducts,
      await loadProductSyncStateMap(),
      BATCH_SIZE,
    );

    state.lastRun = {
      startedAt,
      completedAt: new Date().toISOString(),
      success: report.failed.every((f) => f.sku !== "ALL"),
      shop,
      report,
      progress: {
        totalCsvProducts,
        pendingChanges: remaining.pendingTotal,
        pendingNew: remaining.pendingNew,
        pendingUpdated: remaining.pendingUpdated,
        trackedProducts: trackedAfterSync,
        processedThisRun: syncedProducts.length,
        newInBatch,
        createdThisRun: report.created.length,
        deltaOnly: true,
      },
    };

    console.log(
      `[cron-sync] Batch done — created: ${report.created.length}, updated: ${report.updated.length}, skipped: ${report.skipped.length}, failed: ${report.failed.length} (${remaining.pendingTotal} pending, ${remaining.pendingNew} new SKUs waiting)`,
    );

    if (report.failed.length > 0) {
      for (const fail of report.failed.slice(0, 3)) {
        console.error(`[cron-sync] Error SKU ${fail.sku}: ${fail.reason}`);
      }
    }

    if (remaining.pendingTotal === 0 && trackedAfterSync >= totalCsvProducts) {
      state.cachedProducts = null;
      await unlink(CSV_CACHE_PATH).catch(() => {});
      console.log("[cron-sync] All CSV products synced — cache cleared for next fetch.");
    }

    return state.lastRun;
  } catch (err) {
    state.lastRun = {
      startedAt,
      completedAt: new Date().toISOString(),
      success: false,
      error: err.message,
      progress: {
        totalCsvProducts: state.cachedProducts?.length ?? 0,
        pendingChanges: null,
        pendingNew: null,
        pendingUpdated: null,
        trackedProducts: null,
        processedThisRun: 0,
        deltaOnly: true,
      },
    };

    console.error("[cron-sync] Failed:", err.message);
    return state.lastRun;
  } finally {
    state.isRunning = false;
  }
}

export function startCronSync() {
  const state = getState();

  if (process.env.CRON_SYNC_ENABLED === "false") {
    console.log("[cron-sync] Disabled (CRON_SYNC_ENABLED=false)");
    return;
  }

  if (!process.env.FTP_HOST) {
    console.log("[cron-sync] FTP_HOST not set — cron not started");
    return;
  }

  if (state.scheduled) {
    console.log("[cron-sync] Already scheduled (skip duplicate)");
    return;
  }

  state.scheduled = true;

  const minutes = Number(process.env.CRON_SYNC_INTERVAL_MINUTES || 10);

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 59) {
    console.error("[cron-sync] CRON_SYNC_INTERVAL_MINUTES must be 1-59");
    return;
  }

  const schedule = `*/${minutes} * * * *`;

  state.cronTask = cron.schedule(schedule, () => {
    runCronSyncJob().catch((err) => {
      console.error("[cron-sync] Unhandled error:", err);
    });
  });

  console.log(
    `[cron-sync] Scheduled every ${minutes} minute(s), batch size ${BATCH_SIZE}, delta by product data (${schedule})`,
  );
}
