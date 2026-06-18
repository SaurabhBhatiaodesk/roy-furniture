# Roy Furniture — Shopify Sync Project
## Client Handoff & Action Items

**Prepared for:** Roy Furniture  
**Store:** roy-furniture.myshopify.com  
**Project:** Automated Furniture Wizard → Shopify Product Sync  
**Status:** Development complete on local environment — **Heroku deployment pending**  
**Last updated:** 16 June 2026

---

Dear Team,

Please find below a complete summary of what has been built, what we need from you, and how the system works going forward.

---

## WORK COMPLETED TODAY — 16 June 2026

The following was developed and tested on our local environment today:

### Smart Delta Sync (Last Updated By Vendor)
- Built change-detection using the **Last Updated By Vendor** CSV column
- App syncs only **new SKUs** or rows where this value **changed** — skips all unchanged products
- Created **ProductSyncState** database table to store last synced value per SKU
- Eliminates need to re-process all 45,000+ products on every run

### New Product Priority
- New products (SKU not in our database) are queued and synced **first**
- Updated products (Last Updated By Vendor changed) sync after new ones
- Fresh CSV downloaded from Furniture Wizard SFTP on **every cron run**

### Batch & Performance Settings
- Batch size set to **250 products per run** (every 10 minutes)
- Chosen to respect Shopify GraphQL API rate limits and keep server stable
- Failed SKUs automatically retry on the next cycle

### Product Status Logic (Verified)
| Shopify Status | Rule | CSV |
|----------------|------|-----|
| Archived | Discontinue = TRUE | Column AI |
| Active | Available > 0 | Column O |
| Draft | Stock 0, not discontinued | — |

### Admin UI — FTP Cron Sync Page
- Last run status (Success / Failed)
- Created · Updated · Skipped · Failed counts
- Pending **new** products banner and count
- Pending **updated** products count
- List of newly created SKUs from last run
- **Run Sync Now** manual trigger button

### SFTP & CSV Integration (Tested)
- SFTP connection to `ftp.furnwiz.cloud` (port 22) working
- `InvAdvBranchSum.csv` (~20MB, ~45,000+ products) downloads and parses successfully
- All CSV columns mapped to Shopify fields (SKU, title, price, inventory, status, tags, vendor, etc.)

### Files / Modules Built or Updated Today
| Module | Purpose |
|--------|---------|
| `branchSumCsvAdapter.js` | Parses CSV including Last Updated By Vendor |
| `productSyncState.server.js` | Delta sync logic and SKU tracking database |
| `cronSync.server.js` | Scheduled sync with smart filtering and batch processing |
| `app.cron.jsx` | Admin monitoring UI |
| `prisma/schema.prisma` | ProductSyncState table added |
| Client documentation | Handoff notes prepared for your review |

---

## PART 1 — ACTION REQUIRED FROM CLIENT

### 1.1 Last Updated By Vendor — Please Read Carefully ⚠️

We have implemented a **smart sync system** that uses the CSV column:

### **Last Updated By Vendor**

**What this means for your team:**

When you update a product in Furniture Wizard, the **Last Updated By Vendor** field in the CSV **must also be updated** (e.g. date/time stamp or any new value) for that product row.

| If you do this | Result |
|----------------|--------|
| ✅ Update product data **AND** update **Last Updated By Vendor** | Only that product syncs to Shopify — fast, within ~10 minutes |
| ❌ Update product data but **do NOT** change **Last Updated By Vendor** | Our app will **not detect the change** — product will **not sync** to Shopify |

**Why we built it this way:**

Your CSV has **45,000+ products**. If we synced all of them on every run, it would:
- Take **2–3 days** every single time
- Overload Shopify's API and cause errors
- Slow down your store updates significantly

By using **Last Updated By Vendor** as a change flag, we only sync products that Furniture Wizard actually modified. This keeps daily updates **fast and reliable**.

**Please ensure your Furniture Wizard process updates this column whenever product details, price, stock, or status changes.**

---

### 1.2 Heroku Server — App Deployment (Action Needed)

The app has been fully developed and tested on a **local development server**. For it to run **24/7 automatically** (cron sync every 10 minutes), it needs to be deployed to a **Heroku production server**.

**We need one of the following from you:**

| Option | What we need |
|--------|--------------|
| **Option A — You give us access** | Heroku account login access **OR** invite us as a collaborator on your Heroku team so we can create and deploy the app |
| **Option B — You create the app** | Create a Heroku account/app yourself and share the credentials with us — we will handle the deployment and configuration |

**What will be set up on Heroku:**
- Roy Furniture Shopify app (production)
- PostgreSQL database (required for production — replaces local SQLite)
- Environment variables (SFTP credentials, Shopify keys, cron settings)
- Always-on server dyno (so cron runs every 10 minutes without interruption)

**Please confirm which option you prefer and provide access at your earliest convenience so we can go live.**

---

### 1.3 Shopify App Access

Please also confirm:
- [ ] The Roy Furniture app is installed on `roy-furniture.myshopify.com`
- [ ] All required permissions have been approved (products, inventory, locations)
- [ ] The app has been opened at least once in Shopify admin (required for automated sync to work)

---

## PART 2 — WHAT HAS BEEN BUILT (Local Development Complete)

The following has been fully developed and tested on our local environment:

### 2.1 Automated CSV Sync from Furniture Wizard

| Feature | Detail |
|---------|--------|
| **Source file** | `InvAdvBranchSum.csv` |
| **Connection** | SFTP — `ftp.furnwiz.cloud` (port 22) |
| **Schedule** | Automatic every **10 minutes** |
| **Batch size** | **250 products per run** |
| **Manual trigger** | Available via **FTP Cron Sync** page in Shopify app admin |

### 2.2 Smart Delta Sync

- Uses **Last Updated By Vendor** to detect changes
- Only syncs **new SKUs** or **changed products** — not all 45,000+ every day
- **New products are synced first** before routine updates
- Fresh CSV downloaded on each scheduled run

### 2.3 Product Create & Update

| Action | Trigger |
|--------|---------|
| **Create** | Item Number (SKU) not found in Shopify |
| **Update** | Item Number (SKU) already exists in Shopify |

### 2.4 Product Status Rules (Automatic)

| Shopify Status | Condition | CSV Column |
|----------------|-----------|------------|
| **Archived** | Product discontinued | **Discontinue = TRUE** (Column AI) |
| **Active** | Stock available | **Available > 0** (Column O) |
| **Draft** | No stock, not discontinued | Available = 0 |

### 2.5 CSV Field Mapping to Shopify

| CSV Column | Shopify Field |
|------------|---------------|
| Item Number | Variant SKU (match key) |
| Model / RealName | Product Title |
| Description | Product Description |
| Manufacturer | Vendor |
| Category | Product Type |
| Retail | Selling Price |
| Regular Price | Compare-at Price |
| Available | Inventory Quantity |
| Collection, Subcategory, Type, Color, Style | Tags |
| Dimensions, Item Size | Product Description |
| Discontinue | Status → Archived |
| Last Updated By Vendor | Change detection (smart sync) |
| CloseOut | Tag: `closeout` |
| Hot List | Tag: `hot-list` |
| Spcl Order | Tag: `special-order` |

### 2.6 Admin Monitoring Page

Inside the Shopify app → **FTP Cron Sync**:
- Last run status (Success / Failed)
- Created · Updated · Skipped · Failed counts
- Pending new products count
- Pending updated products count
- **Run Sync Now** button

### 2.7 Other Technical Items Completed Locally

- Shopify GraphQL product create/update integration
- Automatic Shopify location detection for inventory
- SFTP file download with error handling (~20MB CSV)
- Sync state database (tracks Last Updated By Vendor per SKU)
- New product priority queue
- Shopify app scopes configured (products, inventory, locations)

---

## PART 3 — TIMELINE EXPECTATIONS

### First-time sync (after Heroku deployment)

| | |
|---|---|
| **Testing & verification** | Approximately **1 hour** after Heroku deployment — we verify SFTP connection, CSV parsing, and sample product sync to Shopify |
| **Products to sync (full catalog)** | All ~45,000+ (one-time, after testing is confirmed) |
| **Speed** | 250 products every 10 minutes |
| **Estimated time (full catalog)** | **2–3 days** for complete initial load |
| **Action needed** | None — allow testing (~1 hr) then full sync to run |

### After first sync is complete (daily operations)

| | |
|---|---|
| What syncs | Only new SKUs + changed Last Updated By Vendor |
| Speed | Usually within **10 minutes** |
| Action needed | Ensure Furniture Wizard updates **Last Updated By Vendor** on changes |

---

## PART 4 — WHY BATCH SIZE IS 250

| Reason | Explanation |
|--------|-------------|
| Shopify API rate limits | Too many API calls at once causes throttling and failures |
| Each product = multiple API calls | Lookup, create/update, price, inventory, status |
| Reliability | 250 per batch = stable, consistent sync |
| Daily updates unaffected | Batch size only matters for the one-time initial load |

---

## PART 5 — WHAT HAPPENS AFTER HEROKU DEPLOYMENT

Once Heroku access is provided and the app is deployed:

1. ✅ App runs 24/7 on Heroku server
2. ✅ **Testing & verification (~1 hour)** — SFTP, CSV, and sample sync checked
3. ✅ Cron sync starts automatically every 10 minutes
4. ✅ First full catalog sync begins (**~2–3 days** for all ~45k products)
5. ✅ After go-live — only changed/new products sync daily (~10 minutes)
6. ✅ You monitor via **FTP Cron Sync** page in Shopify admin

**We will handle:**
- Heroku app creation and configuration
- Database setup (PostgreSQL)
- Environment variables
- Shopify app URL update for production
- Testing first production sync

**You will need to:**
- Provide Heroku access (Option A or B above)
- Keep Furniture Wizard **Last Updated By Vendor** updated on product changes
- Allow **~1 hour** for testing after deploy, then **2–3 days** for initial full sync after go-live

---

## PART 6 — QUICK SUMMARY

| Topic | Detail |
|-------|--------|
| **Development status** | ✅ Complete locally |
| **Production deployment** | ⏳ Pending — Heroku access needed |
| **Data source** | Furniture Wizard `InvAdvBranchSum.csv` via SFTP |
| **Match key** | Item Number = Shopify SKU |
| **Smart sync key** | Last Updated By Vendor — **must be updated in FW on changes** |
| **Product status** | Discontinue → Archived · Stock > 0 → Active · No stock → Draft |
| **Schedule** | Every 10 min · 250 products per run |
| **Testing after deploy** | ~1 hour (verify sync is working) |
| **First full sync** | ~2–3 days after go-live (full ~45k catalog) |
| **Daily updates** | ~10 minutes (only changed products) |

---

## PART 7 — NEXT STEPS

| # | Action | Owner |
|---|--------|-------|
| 1 | Confirm **Last Updated By Vendor** will be updated in Furniture Wizard on product changes | **Client** |
| 2 | Provide **Heroku account access** OR confirm you will create the Heroku app | **Client** |
| 3 | Confirm Shopify app is installed and permissions approved | **Client** |
| 4 | Deploy app to Heroku production server | **Development Team** |
| 5 | Testing & verification (~1 hour) | **Development Team** |
| 6 | Run and monitor first full catalog sync (~2–3 days) | **Development Team** |
| 7 | Confirm go-live and hand over monitoring | **Both** |

---

Please review this document and let us know:
1. Which Heroku option you prefer (A — give us access, or B — you create the app)
2. Confirmation that **Last Updated By Vendor** will be maintained in Furniture Wizard

We are ready to deploy as soon as Heroku access is provided.

---

*Roy Furniture — Shopify Product Sync Project*  
*Development Team*
