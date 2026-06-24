const workerSecret = (process.env.WORKER_SECRET || "").trim();
const batchSize = Number(process.env.SHOPIFY_SYNC_WORKER_BATCH_SIZE || 3);
const delayMs = Number(process.env.SHOPIFY_SYNC_WORKER_DELAY_MS || 1500);
const idleMs = Number(process.env.SHOPIFY_SYNC_WORKER_IDLE_MS || 10000);
const workerUrl = (
  process.env.SHOPIFY_SYNC_WORKER_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}/api/worker/shopify-sync`
).trim();
const runOnce = process.argv.includes("--once");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBatch() {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify({
      batchSize,
      delayMs,
    }),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`Worker route ${response.status}: ${json?.error || text || "request_failed"}`);
  }

  return json;
}

async function main() {
  if (!workerSecret) {
    throw new Error("Missing WORKER_SECRET");
  }

  console.log(`[shopify-sync-worker] start url=${workerUrl} batchSize=${batchSize} delayMs=${delayMs} idleMs=${idleMs} once=${runOnce}`);

  do {
    const startedAt = Date.now();
    const result = await runBatch();
    console.log(
      `[shopify-sync-worker] batch ok locked=${result?.lockedCount ?? 0} succeeded=${result?.succeededCount ?? 0} failed=${result?.failedCount ?? 0} retried=${result?.retriedCount ?? 0} durationMs=${Date.now() - startedAt}`,
    );
    if (runOnce) break;
    await sleep(idleMs);
  } while (true);
}

main().catch((error) => {
  console.error(`[shopify-sync-worker] ${error instanceof Error ? error.message : "worker_failed"}`);
  process.exit(1);
});
