import { Form, useActionData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  Box,
  List,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { createSyncJobFromCsv } from "../services/syncQueue.server";
import { processSyncQueueBatch } from "../services/processSyncQueue.server";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("intent");

  if (intent === "upload") {
    const webFormatFile = formData.get("webFormat");
    const branchSumFile = formData.get("branchSum");
    const inventoryExportFile = formData.get("inventoryExport");

    if (!webFormatFile || webFormatFile.size === 0) {
      return { success: false, message: "Please upload WebFormat.csv." };
    }

    if (!branchSumFile || branchSumFile.size === 0) {
      return { success: false, message: "Please upload InvAdvBranchSum.csv." };
    }

    if (!inventoryExportFile || inventoryExportFile.size === 0) {
      return { success: false, message: "Please upload InvAdvExport.csv." };
    }

    const webFormatContent = await webFormatFile.text();
    const branchSumContent = await branchSumFile.text();
    const inventoryExportContent = await inventoryExportFile.text();

    const result = await createSyncJobFromCsv({
      webFormatContent,
      branchSumContent,
      inventoryExportContent,
    });

    return {
      success: true,
      type: "queued",
      ...result,
    };
  }

  if (intent === "process") {
    const jobId = formData.get("jobId");

    if (!jobId) {
      return { success: false, message: "Missing job ID." };
    }

    const result = await processSyncQueueBatch({
      admin,
      jobId,
      limit: 10,
    });

    return {
      success: true,
      type: "processed",
      jobId,
      ...result,
    };
  }

  return { success: false, message: "Invalid action." };
}

export default function UploadPage() {
  const data = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const jobId = data?.jobId || data?.job?.id;

  return (
    <Page
      title="Furniture Wizard CSV Import"
      subtitle="Upload all 3 CSV files, create queue, then process products in batches."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="500">
                {data?.success && (
                  <Banner
                    tone="success"
                    title={
                      data.type === "queued"
                        ? "CSV queued successfully"
                        : "Batch processed"
                    }
                  >
                    {data.type === "queued" && (
                      <>
                        <p>Total rows: {data.totalRows}</p>
                        <p>Queued products: {data.queuedProducts}</p>
                      </>
                    )}

                    {data.type === "processed" && (
                      <>
                        <p>Processed: {data.processed}</p>
                        <p>Success: {data.job?.success}</p>
                        <p>Failed: {data.job?.failed}</p>
                        <p>Status: {data.job?.status}</p>
                      </>
                    )}

                    {data?.results && (
                      <pre style={{ maxHeight: "300px", overflow: "auto" }}>
                        {JSON.stringify(data.results, null, 2)}
                      </pre>
                    )}
                  </Banner>
                )}

                {data?.success === false && (
                  <Banner tone="critical" title="Upload failed">
                    <p>{data.message}</p>
                  </Banner>
                )}

                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Upload Furniture Wizard CSV Files
                  </Text>
                  <Text as="p" tone="subdued">
                    Upload all three CSV files. The app will merge data by SKU
                    and save it into queue. Shopify sync will run separately in
                    small batches.
                  </Text>
                </BlockStack>

                <Divider />

                <Form method="post" encType="multipart/form-data">
                  <input type="hidden" name="intent" value="upload" />

                  <BlockStack gap="400">
                    <Box
                      padding="600"
                      borderColor="border"
                      borderWidth="025"
                      borderRadius="300"
                      background="bg-surface-secondary"
                    >
                      <BlockStack gap="400">
                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            WebFormat.csv
                          </Text>
                          <input
                            type="file"
                            name="webFormat"
                            accept=".csv"
                            required
                          />
                        </BlockStack>

                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            InvAdvBranchSum.csv
                          </Text>
                          <input
                            type="file"
                            name="branchSum"
                            accept=".csv"
                            required
                          />
                        </BlockStack>

                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            InvAdvExport.csv
                          </Text>
                          <input
                            type="file"
                            name="inventoryExport"
                            accept=".csv"
                            required
                          />
                        </BlockStack>
                      </BlockStack>
                    </Box>

                    <Button submit variant="primary" loading={isSubmitting}>
                      Upload and Create Queue
                    </Button>
                  </BlockStack>
                </Form>

                {jobId && data?.job?.status !== "completed" && (
                  <>
                    <Divider />

                    <Form method="post">
                      <input type="hidden" name="intent" value="process" />
                      <input type="hidden" name="jobId" value={jobId} />

                      <BlockStack gap="300">
                        <Text as="p" tone="subdued">
                          Job ID: {jobId}
                        </Text>

                        <Button submit variant="primary" loading={isSubmitting}>
                          Process Next 10 Products
                        </Button>
                      </BlockStack>
                    </Form>
                  </>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Sync Flow
                </Text>

                <List>
                  <List.Item>Upload 3 CSV files</List.Item>
                  <List.Item>Merge records by SKU / ItemNumber</List.Item>
                  <List.Item>Save merged products into DB queue</List.Item>
                  <List.Item>Process 10 products per batch</List.Item>
                  <List.Item>Create/update products in Shopify</List.Item>
                  <List.Item>Update price and inventory</List.Item>
                </List>

                <Divider />

                <Text as="p" tone="subdued">
                  This avoids timeout because Shopify API calls run in small
                  batches.
                </Text>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}