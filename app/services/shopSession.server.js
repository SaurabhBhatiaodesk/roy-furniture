import prisma from "../db.server.js";

async function getOfflineSessions() {
  return prisma.session.findMany({
    where: {
      isOnline: false,
      accessToken: { not: "" },
    },
    select: { id: true, shop: true },
    orderBy: { id: "desc" },
  });
}

/**
 * Resolves which shop to use for background cron / API sync.
 * Priority: preferredShop (from current admin session) → SHOP_DOMAIN env match → latest offline session.
 */
export async function getOfflineShopDomain(preferredShop) {
  const sessions = await getOfflineSessions();

  if (sessions.length === 0) {
    throw new Error(
      "No installed shop found. Open the app in Shopify admin first to create an offline session.",
    );
  }

  if (preferredShop) {
    const preferred = sessions.find((s) => s.shop === preferredShop);
    if (preferred) return preferred.shop;
  }

  const envShop = process.env.SHOP_DOMAIN?.trim();
  if (envShop) {
    const envMatch = sessions.find((s) => s.shop === envShop);
    if (envMatch) return envMatch.shop;
  }

  if (sessions.length > 1) {
    console.warn(
      `[shop-session] Multiple offline sessions found (${sessions.map((s) => s.shop).join(", ")}). Using ${sessions[0].shop}`,
    );
  }

  return sessions[0].shop;
}

export async function getOfflineShopDomainOrNull(preferredShop) {
  try {
    return await getOfflineShopDomain(preferredShop);
  } catch {
    return null;
  }
}

export async function listOfflineShops() {
  const sessions = await getOfflineSessions();
  return sessions.map((s) => s.shop);
}
