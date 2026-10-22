import { useState, useCallback } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Box,
  Divider,
  Badge,
  DataTable,
  ProgressBar,
  EmptyState,
  Spinner,
  Thumbnail,
  Icon,
  Collapsible,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  AlertCircleIcon,
  MinusCircleIcon,
  RefreshIcon,
  UploadIcon,
  ClockIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { branchSumCsvAdapter as csvAdapter } from "../adapters/branchSumCsvAdapter";
import { apiAdapter } from "../adapters/apiAdapter";
import { runInventorySync } from "../services/inventorySync";

// ─── Action ────────────────────────────────────────────────

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || file.size === 0) {
    return { success: false, message: "Please upload a CSV file." };
  }

  const fileContent = await file.text();

  try {
    const adapter = csvAdapter({ fileContent });

    const report = await runInventorySync({
      adapter,
      admin,
      shop: session.shop,
      locationId: session.locationId,
    });

    return { success: true, report };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ─── Stat Card Component ───────────────────────────────────

function StatCard({ label, count, tone, icon }) {
  const toneColors = {
    success: "bg-surface-success",
    warning: "bg-surface-warning",
    critical: "bg-surface-critical",
    info: "bg-surface-info",
  };

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" tone="subdued" variant="bodySm">
              {label}
            </Text>
            <Icon source={icon} tone={tone} />
          </InlineStack>
          <Text as="p" variant="heading2xl" fontWeight="bold">
            {count}
          </Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Collapsible Table Section ─────────────────────────────

function CollapsibleSection({ title, badge, tone, rows, headings, open }) {
  const [isOpen, setIsOpen] = useState(open ?? true);

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <button
            onClick={() => setIsOpen((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              width: "100%",
              textAlign: "left",
            }}
          >
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h3" variant="headingMd">
                  {title}
                </Text>
                <Badge tone={tone}>{String(rows.length)}</Badge>
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">
                {isOpen ? "Hide ▲" : "Show ▼"}
              </Text>
            </InlineStack>
          </button>

          <Collapsible open={isOpen} id={`section-${title}`}>
            {rows.length === 0 ? (
              <Box paddingBlockStart="300">
                <Text as="p" tone="subdued">
                  No items in this category.
                </Text>
              </Box>
            ) : (
              <Box paddingBlockStart="300">
                <DataTable
                  columnContentTypes={headings.map(() => "text")}
                  headings={headings}
                  rows={rows}
                  hoverable
                />
              </Box>
            )}
          </Collapsible>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Sync Report Component ─────────────────────────────────

function SyncReport({ report }) {
  const totalProcessed = report.updated.length + report.skipped.length + report.failed.length;
  const successRate =
    totalProcessed > 0
      ? Math.round((report.updated.length / totalProcessed) * 100)
      : 0;

  const duration = report.completedAt && report.startedAt
    ? ((new Date(report.completedAt) - new Date(report.startedAt)) / 1000).toFixed(1)
    : null;

  // Table rows
  const updatedRows = report.updated.map((item) => [
    item.sku,
    item.productTitle,
    String(item.previousQuantity),
    String(item.newQuantity),
    item.newQuantity === 0
      ? <Badge tone="critical">Out of Stock</Badge>
      : <Badge tone="success">In Stock</Badge>,
    item.statusChanged
      ? <Badge tone="warning">{item.statusChanged}</Badge>
      : <Badge tone="success">No change</Badge>,
  ]);

  const skippedRows = report.skipped.map((item) => [
    item.sku,
    item.reason,
  ]);

  const failedRows = report.failed.map((item) => [
    item.sku,
    item.reason,
  ]);

  return (
    <BlockStack gap="500">
      {/* Summary Banner */}
      <Banner
        tone={report.failed.length > 0 ? "warning" : "success"}
        title={
          report.failed.length > 0
            ? `Sync completed with ${report.failed.length} error(s)`
            : "Sync completed successfully"
        }
      >
        <p>
          {report.updated.length} products updated · {report.skipped.length} skipped ·{" "}
          {report.failed.length} failed
          {duration ? ` · Completed in ${duration}s` : ""}
        </p>
      </Banner>

      {/* Stat Cards */}
      <Layout>
        <Layout.Section variant="oneThird">
          <StatCard
            label="Products Updated"
            count={report.updated.length}
            tone="success"
            icon={CheckCircleIcon}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <StatCard
            label="Skipped"
            count={report.skipped.length}
            tone="warning"
            icon={MinusCircleIcon}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <StatCard
            label="Failed"
            count={report.failed.length}
            tone="critical"
            icon={AlertCircleIcon}
          />
        </Layout.Section>
      </Layout>

      {/* Success Rate */}
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Sync Success Rate
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {successRate}%
              </Text>
            </InlineStack>
            <ProgressBar progress={successRate} tone="success" size="medium" />
            <InlineStack gap="400">
              <Text as="p" variant="bodySm" tone="subdued">
                Started: {new Date(report.startedAt).toLocaleString()}
              </Text>
              {report.completedAt && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Completed: {new Date(report.completedAt).toLocaleString()}
                </Text>
              )}
            </InlineStack>
          </BlockStack>
        </Box>
      </Card>

      {/* Updated Products Table */}
      {report.updated.length > 0 && (
        <CollapsibleSection
          title="Updated Products"
          tone="success"
          open={true}
          rows={updatedRows}
          headings={["SKU", "Product", "Prev Qty", "New Qty", "Stock Status", "Visibility"]}
        />
      )}

      {/* Skipped Table */}
      {report.skipped.length > 0 && (
        <CollapsibleSection
          title="Skipped"
          tone="warning"
          open={false}
          rows={skippedRows}
          headings={["SKU", "Reason"]}
        />
      )}

      {/* Failed Table */}
      {report.failed.length > 0 && (
        <CollapsibleSection
          title="Failed"
          tone="critical"
          open={true}
          rows={failedRows}
          headings={["SKU", "Error"]}
        />
      )}
    </BlockStack>
  );
}

// ─── Upload Form Component ─────────────────────────────────

function UploadForm({ isSubmitting }) {
  return (
    <Card>
      <Box padding="500">
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Run Inventory Sync
            </Text>
            <Text as="p" tone="subdued">
              Upload a Furniture Wizard CSV export. The system will compare
              quantities and update Shopify inventory automatically.
            </Text>
          </BlockStack>

          <Divider />

          <Form method="post" encType="multipart/form-data">
            <BlockStack gap="400">
              <Box
                padding="600"
                borderColor="border"
                borderWidth="025"
                borderRadius="300"
                background="bg-surface-secondary"
              >
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    CSV File
                  </Text>
                  <input type="file" name="file" accept=".csv" />
                  <Text as="p" tone="subdued" variant="bodySm">
                    Required columns: sku, model_name, description, price, quantity
                  </Text>
                </BlockStack>
              </Box>

              <InlineStack align="end">
                <Button
                  submit
                  variant="primary"
                  loading={isSubmitting}
                  icon={RefreshIcon}
                  size="large"
                >
                  {isSubmitting ? "Syncing..." : "Upload & Sync Inventory"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Empty State ───────────────────────────────────────────

function NoSyncYet() {
  return (
    <Card>
      <EmptyState
        heading="No sync run yet"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          Upload a Furniture Wizard CSV file above to start syncing your
          inventory with Shopify.
        </p>
      </EmptyState>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────

export default function SyncDashboard() {
  const data = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <Page
      title="Inventory Sync Dashboard"
      subtitle="Sync Furniture Wizard inventory to Shopify"
      primaryAction={{
        content: "View Upload History",
        disabled: true, // future feature
      }}
    >
      <Layout>
        {/* Left: Upload form */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <UploadForm isSubmitting={isSubmitting} />

            {/* Info Card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    What gets synced?
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    {[
                      "Inventory quantity per SKU",
                      "Product set to DRAFT when out of stock",
                      "Product set to ACTIVE when back in stock",
                      "Only changed products are updated",
                    ].map((item) => (
                      <InlineStack key={item} gap="200" blockAlign="start">
                        <Icon source={CheckCircleIcon} tone="success" />
                        <Text as="p" variant="bodySm">
                          {item}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Right: Sync results */}
        <Layout.Section>
          {isSubmitting ? (
            <Card>
              <Box padding="800">
                <BlockStack gap="400" align="center">
                  <Spinner size="large" />
                  <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                    Syncing inventory with Shopify...
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    This may take a moment depending on your catalog size.
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          ) : data?.success === false ? (
            <Banner tone="critical" title="Sync failed">
              <p>{data.message}</p>
            </Banner>
          ) : data?.success && data?.report ? (
            <SyncReport report={data.report} />
          ) : (
            <NoSyncYet />
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}





// For original API-based sync page
// import { Form, useActionData } from "react-router";
// import { authenticate } from "../shopify.server";
// import { runFullSync } from "../sync.server";

// export async function action({ request }) {
//   const { admin } = await authenticate.admin(request);
//   const results = await runFullSync(admin);

//   return { results };
// }

// export default function SyncPage() {
//   const actionData = useActionData();

//   return (
//     <div style={{ padding: 24 }}>
//       <h1>Furniture Wizard Sync</h1>

//       <Form method="post">
//         <button type="submit">Run Full Sync</button>
//       </Form>

//       {actionData?.results && (
//         <pre>{JSON.stringify(actionData.results, null, 2)}</pre>
//       )}
//     </div>
//   );
// }