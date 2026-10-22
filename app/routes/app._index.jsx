import { authenticate } from "../shopify.server";
export async function loader({ request }) { await authenticate.admin(request); return null; }
export async function action({ request }) { await authenticate.admin(request); return new Response("Product creation is disabled", { status: 403 }); }
export default function Index() {
 return <s-page heading="Roy?s Furniture"><s-section heading="Furniture Wizard sync"><s-paragraph>Sync is paused pending client sign-off. New Furniture Wizard products are never imported automatically. Only matched, active products published to the Online Store are eligible for Retail price, verified inventory, and discontinued updates.</s-paragraph><s-link href="/app/sku-audit">Run a read-only SKU audit</s-link></s-section></s-page>;
}
