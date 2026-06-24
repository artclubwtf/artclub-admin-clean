const fs = require("fs");
const path = require("path");
const Module = require("module");
const { transformSync } = require("next/dist/build/swc");

const projectRoot = path.resolve(__dirname, "..");
const batchSize = Number(process.env.SHOPIFY_SYNC_WORKER_BATCH_SIZE || 3);
const delayMs = Number(process.env.SHOPIFY_SYNC_WORKER_DELAY_MS || 1500);
const idleMs = Number(process.env.SHOPIFY_SYNC_WORKER_IDLE_MS || 10000);
const workerUrl = (process.env.SHOPIFY_SYNC_WORKER_URL || "").trim();
const configuredMode = (process.env.WORKER_MODE || "direct").trim().toLowerCase();
const workerMode = configuredMode === "http" && workerUrl ? "http" : "direct";
const runOnce = process.argv.includes("--once");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerTypeScriptRequireHook() {
  const originalTsHandler = Module._extensions[".ts"];
  const originalTsxHandler = Module._extensions[".tsx"];

  function compile(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const { code } = transformSync(source, {
      filename,
      sourceMaps: "inline",
      jsc: {
        target: "es2020",
        parser: {
          syntax: "typescript",
          tsx: filename.endsWith(".tsx"),
          decorators: true,
          dynamicImport: true,
        },
      },
      module: {
        type: "commonjs",
      },
    });
    module._compile(code, filename);
  }

  Module._extensions[".ts"] = compile;
  Module._extensions[".tsx"] = compile;

  return () => {
    if (originalTsHandler) {
      Module._extensions[".ts"] = originalTsHandler;
    } else {
      delete Module._extensions[".ts"];
    }
    if (originalTsxHandler) {
      Module._extensions[".tsx"] = originalTsxHandler;
    } else {
      delete Module._extensions[".tsx"];
    }
  };
}

const restoreRequireHook = registerTypeScriptRequireHook();
const {
  runShopifySyncWorkerLoop,
} = require(path.join(projectRoot, "lib/sync/shopifySyncWorker.ts"));
const {
  createSyncRunId,
  logShopifyWorker,
  logSyncError,
} = require(path.join(projectRoot, "lib/sync/syncLogger.ts"));
restoreRequireHook();

async function runHttpBatch(workerSecret) {
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

async function runHttpLoop() {
  const workerSecret = (process.env.WORKER_SECRET || "").trim();
  const runId = createSyncRunId("shopify-worker-http");
  if (!workerSecret) {
    throw new Error("Missing WORKER_SECRET for WORKER_MODE=http");
  }

  logShopifyWorker(
    "worker_started",
    {
      mode: "http",
      batchSize,
      delayMs,
      idleMs,
      hasMongoUri: Boolean(process.env.MONGODB_URI),
      hasShopifyToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
      hasLocationId: Boolean((process.env.SHOPIFY_ARTIST_STORAGE_LOCATION_ID || "").trim()),
    },
    { runId, force: true },
  );

  logShopifyWorker(
    "worker_http_mode_started",
    {
      url: workerUrl,
    },
    { runId, force: true },
  );

  do {
    try {
      const startedAt = Date.now();
      const result = await runHttpBatch(workerSecret);
      console.log(
        `[shopify-sync-worker] http batch ok locked=${result?.lockedCount ?? 0} succeeded=${result?.succeededCount ?? 0} failed=${result?.failedCount ?? 0} retried=${result?.retriedCount ?? 0} durationMs=${Date.now() - startedAt}`,
      );
      if (runOnce) return result;
      if ((result?.lockedCount ?? 0) === 0) {
        await sleep(idleMs);
      }
    } catch (error) {
      logSyncError(
        "shopify_worker_http_loop_failed",
        error,
        {
          mode: "http",
          url: workerUrl,
        },
        { runId, force: true },
      );
      if (runOnce) throw error;
      await sleep(idleMs);
    }
  } while (true);
}

async function main() {
  if (workerMode === "http") {
    return runHttpLoop();
  }

  return runShopifySyncWorkerLoop({
    batchSize,
    delayMs,
    idleMs,
    runOnce,
  });
}

main().catch((error) => {
  console.error(`[shopify-sync-worker] ${error instanceof Error ? error.message : "worker_failed"}`);
  process.exit(1);
});
