import { authenticate } from "../shopify.server";
import { coordinateShopifyOrder } from "../services/orderCoordination.server";

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);

  await coordinateShopifyOrder({ order: payload, shop });

  return new Response("OK", { status: 200 });
}
