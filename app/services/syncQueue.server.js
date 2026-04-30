import prisma from "../db.server";
import { furnitureWizardCsvAdapter } from "../adapters/furnitureWizardCsvAdapter";

export async function createSyncJobFromCsv({
  webFormatContent,
  branchSumContent,
  inventoryExportContent,
}) {
  const adapter = furnitureWizardCsvAdapter({
    webFormatContent,
    branchSumContent,
    inventoryExportContent,
  });

  const { products, skippedRows, totalRows } = await adapter.getInventory();

  const job = await prisma.syncJob.create({
    data: {
      status: "pending",
      total: products.length,
      items: {
        create: products.map((product) => ({
          sku: product.sku,
          payload: product,
          status: "pending",
        })),
      },
    },
  });

  return {
    jobId: job.id,
    totalRows,
    queuedProducts: products.length,
    skippedRows,
  };
}

export async function getSyncJob(jobId) {
  return prisma.syncJob.findUnique({
    where: { id: jobId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        take: 50,
      },
    },
  });
}

export async function getPendingSyncItems(jobId, limit = 10) {
  return prisma.syncJobItem.findMany({
    where: {
      jobId,
      status: "pending",
    },
    take: limit,
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function markSyncItemSuccess(itemId) {
  return prisma.syncJobItem.update({
    where: { id: itemId },
    data: { status: "success", error: null },
  });
}

export async function markSyncItemFailed(itemId, error) {
  return prisma.syncJobItem.update({
    where: { id: itemId },
    data: {
      status: "failed",
      error: error?.message || String(error),
    },
  });
}

export async function refreshSyncJobStatus(jobId) {
  const [pending, success, failed] = await Promise.all([
    prisma.syncJobItem.count({ where: { jobId, status: "pending" } }),
    prisma.syncJobItem.count({ where: { jobId, status: "success" } }),
    prisma.syncJobItem.count({ where: { jobId, status: "failed" } }),
  ]);

  const status = pending === 0 ? "completed" : "processing";

  return prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status,
      success,
      failed,
    },
  });
}