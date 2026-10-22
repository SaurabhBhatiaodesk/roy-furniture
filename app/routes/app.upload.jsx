import { authenticate } from "../shopify.server";
export async function loader({ request }) { await authenticate.admin(request); return null; }
export async function action({ request }) { await authenticate.admin(request); return new Response("Legacy imports and queued product creation are disabled.", { status: 403 }); }
export default function Upload() { return <s-page heading="Automatic imports disabled"><s-section><s-paragraph>Furniture Wizard products are never automatically created in Shopify. Create and publish the Shopify product with its matching internal SKU, then review the SKU audit before approving sync.</s-paragraph><s-link href="/app/sku-audit">SKU Audit</s-link></s-section></s-page>; }
