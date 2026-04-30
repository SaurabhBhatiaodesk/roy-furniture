import { authenticate } from "../shopify.server";
import { notifyFurnitureWizardOrder } from "../adapters/furnitureWizard.server";

export async function action({ request }) {
  const { payload } = await authenticate.webhook(request);

  await notifyFurnitureWizardOrder(payload);

  return new Response("OK", { status: 200 });
}