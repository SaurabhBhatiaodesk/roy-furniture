# Client review scope — 22 October 2026

Production must remain OFF. Local implementation is not client sign-off.

Implemented: exact internal variant SKU to FW Item Number matching; ACTIVE and
Online Store published products only; no automatic creation, publishing, archiving
or merchandising writes. Duplicate and missing SKUs block updates and appear in
the read-only /app/sku-audit report. FW-only items are excluded before batching.
Retail is mandatory; Regular is never a fallback. Compare-at prices are preserved
pending client approval to clear them. Discontinued is an app-owned boolean
fw_discontinued metafield for merchant automation, defined in both app TOMLs.
Old queued import processing and demo creation are disabled.

Writes default OFF. An approved release must explicitly set FW_SYNC_APPROVED=true,
CRON_SYNC_ENABLED=true, and SHOP_DOMAIN to the intended shop. Manual sync uses the
same guard. Order delivery is also paused. Saved delta state is scoped by shop.

Pending client evidence and release gates:

1. Sample FW export with exact sellable Showroom/Warehouse column names, including
   Showroom=0/Warehouse>0 and discontinued examples. Reservations and current
   Available aggregation have NOT been verified.
2. Configure verified FW_SHOWROOM_AVAILABLE_COLUMN and FW_WAREHOUSE_AVAILABLE_COLUMN,
   or only after confirmation set FW_AVAILABLE_IS_COMBINED_SELLABLE=true for the
   Available/QtyAvailable column. Never infer semantics from screenshots.
3. Confirm FW_SHOPIFY_LOCATION_ID receives combined stock and that other Shopify
   locations will not double-count the same stock. Unstocked items are not activated.
4. Decide whether existing compare-at values should be cleared. No cleanup is run.
5. Confirm ACTIVE + published Online Store eligibility. Manually created Shopify
   products with matching internal SKUs become eligible via the same audit.
6. Run read-only audit against real FW and Shopify data; correct missing/duplicate
   and unmatched SKUs. No live audit has been run for this revised scope.
7. Deploy and verify metafield definitions, configure merchant automation, test
   client-provided fixtures, then obtain sign-off before enabling anything.

Invalid or unverified inventory/Discontinued data blocks all writes for that item;
no stock is guessed as zero and no missing discontinued value is assumed false.
Stock writes use compare-and-set. Titles, descriptions, tags, status, publication
and compare-at fields are never included in sync mutations.

Do not call this production-complete until mapping evidence, live audit, automation
acceptance, and signed approval are completed. Do not restart dynos or auto deploys.
