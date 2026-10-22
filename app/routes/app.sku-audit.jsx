import process from "node:process";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchCsvFromFtp } from "../services/ftpCsv.server.js";
import { branchSumCsvAdapter } from "../adapters/branchSumCsvAdapter.js";
import { auditSkuMatches, loadSyncCatalog } from "../services/restrictedSync.server.js";
export async function loader({ request }) {
 const { admin } = await authenticate.admin(request);
 if (new URL(request.url).searchParams.get("run") !== "1") return { audit: null };
 const fileContent = await fetchCsvFromFtp();
 const { products } = await branchSumCsvAdapter({ fileContent }).getInventory();
 const result = auditSkuMatches(products, await loadSyncCatalog(admin, process.env.FW_SHOPIFY_LOCATION_ID));
 return { audit: { matched: result.matches.length, fwOnly: result.fwOnlyCount, issues: result.issues } };
}
export default function Audit() {
 const { audit } = useLoaderData();
 return <s-page heading="Internal SKU audit"><s-section><s-paragraph>Read-only. No products, prices, inventory, or statuses are changed. Checks exact internal SKUs on active Online Store products.</s-paragraph><s-link href="?run=1">Run audit</s-link>{audit && <><s-paragraph>Matched: {audit.matched}. FW-only excluded: {audit.fwOnly}. Issues: {audit.issues.length}.</s-paragraph><pre>{JSON.stringify(audit.issues, null, 2)}</pre></>}</s-section></s-page>;
}
