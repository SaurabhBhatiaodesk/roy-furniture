import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  Box,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getLastCronRun,
  getCronSyncProgress,
  runCronSyncJob,
} from "../services/cronSync.server.js";
import { getOfflineShopDomainOrNull, listOfflineShops } from "../services/shopSession.server.js";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const shopDomain = await getOfflineShopDomainOrNull(session.shop);
  const allShops = await listOfflineShops();

  return {
    lastRun: getLastCronRun(),
    progress: getCronSyncProgress(),
    intervalMinutes: Number(process.env.CRON_SYNC_INTERVAL_MINUTES || 10),
    batchSize: Number(process.env.CRON_SYNC_BATCH_SIZE || 250),
    ftpConfigured: Boolean(process.env.FTP_HOST),
    shopDomain,
    activeShop: session.shop,
    allShops,
    remoteFile: process.env.FTP_REMOTE_PATH || "/InvAdvBranchSum.csv",
    useLocalFile: Boolean(process.env.FTP_LOCAL_FILE_PATH),
    useSftp: process.env.FTP_USE_SFTP === "true" || Number(process.env.FTP_PORT || 21) === 22,
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "run-now") {
    const result = await runCronSyncJob({ shop: session.shop });
    return { ok: true, lastRun: result };
  }

  return { ok: false, message: "Unknown action" };
}

export default function CronSyncPage() {
  const data = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isRunning = navigation.state === "submitting";

  const lastRun = actionData?.lastRun || data.lastRun;

  return (
    <Page
      title="FTP Cron Sync"
      subtitle="InvAdvBranchSum.csv — automatic sync every 10 minutes"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {!data.ftpConfigured && (
              <Banner tone="warning" title="FTP not configured">
                <p>
                  Set FTP_HOST, FTP_USER, and FTP_PASSWORD in your environment
                  to enable automatic sync.
                </p>
              </Banner>
            )}

            {!data.shopDomain && (
              <Banner tone="warning" title="No shop session">
                <p>
                  Open this app in Shopify admin once so an offline session is
                  saved. Cron sync uses that shop automatically.
                </p>
              </Banner>
            )}

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Schedule
                  </Text>
                  <Text as="p">
                    Runs every <strong>{data.intervalMinutes} minutes</strong>,
                    processes up to <strong>{data.batchSize} products</strong> per
                    run — <strong>new SKUs first</strong>, then updated rows where{" "}
                    <strong>synced product data</strong> changed. Timestamp-only changes are ignored.
                  </Text>
                  <Text as="p" tone="subdued">
                    Fresh CSV from SFTP each run — new products show up within one
                    cron cycle.
                  </Text>
                  <Text as="p" tone="subdued">
                    Reads <code>{data.remoteFile}</code>
                    {data.useLocalFile
                      ? " from local file (FTP_LOCAL_FILE_PATH)"
                      : data.useSftp
                        ? " via SFTP"
                        : " via FTP"}
                    .
                  </Text>
                  {data.progress.pendingNew > 0 && (
                    <Banner tone="info" title="New products waiting">
                      <p>
                        <strong>{data.progress.pendingNew}</strong> new SKU(s) in CSV
                        not yet in Shopify — synced first on next run.
                      </p>
                    </Banner>
                  )}
                  {data.progress.pendingChanges > 0 && (
                    <Text as="p" tone="subdued">
                      Pending: {data.progress.pendingChanges} total
                      {data.progress.pendingNew > 0 && (
                        <> ({data.progress.pendingNew} new, {data.progress.pendingUpdated} updated)</>
                      )}
                      {data.progress.totalCsvProducts > 0 && (
                        <> of {data.progress.totalCsvProducts} CSV products</>
                      )}
                    </Text>
                  )}
                  {data.progress.trackedProducts > 0 && (
                    <Text as="p" tone="subdued">
                      Tracked in database: {data.progress.trackedProducts} SKUs
                    </Text>
                  )}
                  <Text as="p" tone="subdued">
                    Active shop: {data.activeShop}
                  </Text>
                  {data.allShops.length > 1 && (
                    <Text as="p" tone="subdued">
                      All offline sessions: {data.allShops.join(", ")}
                    </Text>
                  )}

                  <Form method="post">
                    <input type="hidden" name="intent" value="run-now" />
                    <Button submit loading={isRunning} variant="primary">
                      Run Sync Now
                    </Button>
                  </Form>
                </BlockStack>
              </Box>
            </Card>

            {lastRun && (
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Last Run
                      </Text>
                      <Badge tone={lastRun.success ? "success" : "critical"}>
                        {lastRun.success ? "Success" : "Failed"}
                      </Badge>
                    </InlineStack>

                    <Text as="p" tone="subdued">
                      Started: {new Date(lastRun.startedAt).toLocaleString()}
                    </Text>

                    {lastRun.completedAt && (
                      <Text as="p" tone="subdued">
                        Completed:{" "}
                        {new Date(lastRun.completedAt).toLocaleString()}
                      </Text>
                    )}

                    {lastRun.error && (
                      <Banner tone="critical">
                        <p>{lastRun.error}</p>
                      </Banner>
                    )}

                    {lastRun.report && (
                      <BlockStack gap="200">
                        <Text as="p">
                          Created: {lastRun.report.created.length} · Updated:{" "}
                          {lastRun.report.updated.length} · Skipped:{" "}
                          {lastRun.report.skipped.length} · Failed:{" "}
                          {lastRun.report.failed.length}
                          {lastRun.progress?.pendingChanges != null && (
                            <>
                              {" "}
                              · Pending: {lastRun.progress.pendingChanges}
                            </>
                          )}
                        </Text>
                        {lastRun.progress?.pendingNew > 0 && (
                          <Text as="p" tone="subdued">
                            New SKUs still waiting: {lastRun.progress.pendingNew}
                          </Text>
                        )}
                        {lastRun.report.created.length > 0 && (
                          <Text as="p" tone="subdued">
                            Newly added:{" "}
                            {lastRun.report.created
                              .slice(0, 5)
                              .map((item) => item.sku)
                              .join(", ")}
                            {lastRun.report.created.length > 5 ? "…" : ""}
                          </Text>
                        )}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
import process from "node:process";
