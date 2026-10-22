import { assertSyncApproved } from "../services/syncApproval.server.js";
import { authenticate } from "../shopify.server";
import { coordinateShopifyOrder } from "../services/orderCoordination.server";

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);

  try { assertSyncApproved(shop); } catch { return new Response("Integration paused", { status: 200 }); }

  await coordinateShopifyOrder({ order: payload, shop });

  return new Response("OK", { status: 200 });
}
