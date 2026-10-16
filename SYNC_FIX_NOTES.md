# Unnecessary product update fix

CSV timestamps alone no longer trigger sync. The persisted token fingerprints product data.
Existing Shopify product fields are compared before writing; updates include only changed
fields. Existing collection membership and publication are checked before writing.
Stock comparisons use available quantity at the sync location, not aggregate variant stock.
Reports count details, publication, and compare-at price edits as updates. Setup failures
never mark a batch synced.

## Verification

- `npm.cmd test`: regression coverage includes repeat sync with zero mutations, details-only
  edits, collection membership, publication, per-location inventory, failures and compare-at price.
- `npm.cmd run build`
- Shopify GraphQL schema validation for sync operations.

## Production rollout

Deploy the server build through the existing hosting pipeline; Shopify app configuration
deployment alone does not deploy this backend. This checkout also contains earlier pending
changes; review those together before release. Run the normal Prisma generate/migrate deploy
setup for the release. The ProductSyncState changeToken field maps to the existing
lastUpdatedByVendor column; keep saved sync-state rows.

Confirm the installed app has the product, inventory, location and publication scopes used
by this backend. The roy-furniture app configuration includes publication scopes; the generic
shopify.app.toml currently does not.

The first cron cycles will reconcile old tokens in batches (default 250). Matching Shopify
products should require no mutations; genuine differences will be applied. Subsequent identical
CSV exports, including timestamp-only refreshes, should show no pending changes.
Verify production logs and several products from the client's screenshot across two cycles
before telling the client the live incident is resolved. Shopify order or inventory activity
and other apps can still legitimately change product update timestamps.
