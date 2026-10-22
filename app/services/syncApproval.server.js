// Remains disabled after redeploys/restarts until explicitly approved for this shop.
export function assertSyncApproved(shop) {
  if (process.env.FW_SYNC_APPROVED !== "true" ||
      process.env.CRON_SYNC_ENABLED !== "true") {
    throw new Error("Furniture Wizard sync is disabled pending client sign-off.");
  }
  if (!shop || shop !== process.env.SHOP_DOMAIN?.trim()) {
    throw new Error("Sync is restricted to the explicitly configured SHOP_DOMAIN.");
  }
}
