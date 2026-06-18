# Client Email — Balanced Version (Copy & Send)

**Subject:** Roy Furniture Shopify Sync — Handoff Notes & Action Items

---

Hi,

Please find below a summary of the **Roy Furniture Shopify Product Sync** project. Development is complete on our local environment. Full detailed notes are attached.

---

### Project Overview

We have built a Shopify app that automatically reads your inventory file from **Furniture Wizard** (`InvAdvBranchSum.csv`) and creates or updates products in your Shopify store (`roy-furniture.myshopify.com`).

The app runs on a schedule — **every 10 minutes** — and can also be triggered manually from the **FTP Cron Sync** page inside the Shopify app admin.

---

### What We Completed

**1. Automated CSV Sync**
- Connects to Furniture Wizard via SFTP and downloads `InvAdvBranchSum.csv`
- Parses approximately **45,000+ products**
- Matches products using **Item Number = Shopify SKU**
- Creates new products or updates existing ones automatically

**2. Smart Sync — Last Updated By Vendor**
- Instead of syncing all 45,000+ products every day, the app only syncs products that are **new** or **actually changed**
- It uses the CSV column **Last Updated By Vendor** to detect changes
- After each successful sync, we save this value — unchanged products are skipped on the next run
- This keeps daily updates fast (~10 minutes) instead of taking days every time

**3. New Products Priority**
- Brand-new SKUs in the CSV are synced **first**, before routine updates
- Fresh CSV is downloaded on every scheduled run so new items are picked up quickly

**4. Product Status (Automatic)**
| Shopify Status | Condition | CSV Column |
|----------------|-----------|------------|
| Archived | Product discontinued | Discontinue = TRUE (Column AI) |
| Active | Stock available | Available > 0 (Column O) |
| Draft | No stock, not discontinued | Available = 0 |

**5. Field Mapping**
- Model → Title · Manufacturer → Vendor · Retail → Price · Regular Price → Compare-at Price · Available → Inventory · Category, Collection, Color, Style → Tags · and more

**6. Batch Processing**
- **250 products per run**, every **10 minutes**
- Set to respect Shopify API rate limits and keep the sync stable and reliable

---

### What We Need From You

**1. Last Updated By Vendor — Please Confirm ⚠️**

This is the most important point for ongoing sync to work correctly.

When your team updates a product in Furniture Wizard (price, stock, description, status, etc.), the **Last Updated By Vendor** column for that row **must also be updated** (e.g. a new date/time or any changed value).

| Scenario | Result |
|----------|--------|
| Product updated + Last Updated By Vendor updated | ✅ Only that product syncs to Shopify (~10 min) |
| Product updated but Last Updated By Vendor NOT changed | ❌ Change not detected — product will NOT sync |

Without this, the app cannot tell which products changed and would need to re-sync all 45,000+ products every time.

**2. Heroku Server Access**

The app is currently running on our local development server. For it to run **24/7 in production**, it needs to be deployed on **Heroku**.

Please choose one option:

- **Option A:** Provide us access to your Heroku account (or add us as a collaborator) — we will create and deploy the app
- **Option B:** Create the Heroku app yourself and share the credentials — we will handle deployment and configuration

**3. Shopify App**
- Please confirm the Roy Furniture app is installed on your store
- All permissions approved (products, inventory, locations)
- App opened at least once in Shopify admin

---

### Timeline After Go-Live

| Phase | Estimated Time |
|-------|----------------|
| Heroku deployment + testing | ~1 hour |
| First full catalog sync (~45,000 products) | ~2–3 days |
| Daily updates (only changed/new products) | ~10 minutes |

The 2–3 day timeline is only for the **one-time initial load**. After that, only products Furniture Wizard actually changed will sync — usually within one cron cycle.

---

### Next Steps

1. You confirm **Last Updated By Vendor** will be maintained in Furniture Wizard
2. You provide **Heroku access** (Option A or B)
3. We deploy to Heroku and run testing (~1 hour)
4. First full catalog sync begins automatically (~2–3 days)
5. Go-live — app runs automatically, you monitor via FTP Cron Sync page

---

Please confirm Heroku preference (Option A or B) and that Last Updated By Vendor will be updated on product changes.

Happy to jump on a quick call if anything needs clarification.

Thanks,  
[Your Name]

**Attachment:** CLIENT_HANDOFF_FINAL.md
