# Email to Client — Copy & Send

**Subject:** Roy Furniture Shopify Sync — Handoff Notes & Action Items

---

Hi,

Please find attached our project handoff notes for the **Roy Furniture Shopify Product Sync**.

Development is complete on our local environment. To go live, we need a few items from your side:

---

### 1. Last Updated By Vendor (Important)

When you update a product in Furniture Wizard, please ensure the **Last Updated By Vendor** column is also updated for that row. Our app uses this field to detect changes — without it, updated products will **not** sync to Shopify, and we would have to re-sync all 45,000+ products every time.

| If you do | Result |
|-----------|--------|
| Update product **and** update Last Updated By Vendor | Only that product syncs — within ~10 minutes |
| Update product but **do not** change Last Updated By Vendor | Change will **not** be detected — no sync |

---

### 2. Heroku Server Access

The app needs to be deployed on a **Heroku server** to run 24/7. Please either:

- **Option A:** Give us access to your Heroku account (or add us as collaborator), **OR**
- **Option B:** Create the Heroku app yourself and share credentials with us

We will handle the full deployment and configuration once access is provided.

---

### 3. Timeline After Go-Live

| Phase | Time |
|-------|------|
| Testing & verification (after Heroku deploy) | ~**1 hour** |
| Initial full catalog sync (~45,000 products) | ~**2–3 days** |
| Daily updates after that | ~**10 minutes** (only changed/new products) |

---

### 4. What We Completed Today (16 June 2026)

The following was built and tested on our local environment today:

**Smart Delta Sync**
- Implemented **Last Updated By Vendor** as the change-detection key
- App now syncs only **new SKUs** or products where this value **changed** — not all 45,000+ every run
- Each synced SKU is saved in our database so unchanged products are skipped

**New Product Priority**
- Brand-new products in the CSV are synced **first**, before routine updates
- Fresh CSV is downloaded from Furniture Wizard on **every scheduled run** so new items are detected quickly

**Batch Processing**
- Set batch size to **250 products per run** (every 10 minutes) — balanced for Shopify API limits and server stability

**Product Status Rules (Automatic)**
- **Archived** → Discontinue = TRUE (Column AI)
- **Active** → Available > 0 (Column O)
- **Draft** → Stock is 0 and product is not discontinued

**Admin Monitoring Page**
- **FTP Cron Sync** page in Shopify app shows: last run status, created/updated/skipped/failed counts, pending new products, pending updates, and a **Run Sync Now** button

**CSV → Shopify Mapping**
- Item Number → SKU (match key)
- Model, Description, Manufacturer, Category, Retail, Regular Price, Available, tags, and more — all mapped and working

**SFTP Connection**
- Connected to Furniture Wizard (`ftp.furnwiz.cloud`) — ~45,000+ products parsed successfully from `InvAdvBranchSum.csv`

---

### 5. What We Need From You

1. Confirm **Last Updated By Vendor** will be maintained in Furniture Wizard on every product change
2. Confirm Heroku preference — **Option A** (give us access) or **Option B** (you create the app)
3. Confirm the Roy Furniture app is installed in Shopify admin with all permissions approved

---

Full details, field mappings, status rules, and next steps are in the **attached document** (`CLIENT_HANDOFF_FINAL.md`).

Please confirm the above at your earliest convenience so we can proceed with Heroku deployment.

Thanks,  
[Your Name]
