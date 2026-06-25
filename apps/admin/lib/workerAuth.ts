export function hasValidWorkerSecret(req: Request) {
  const expectedSecret = (process.env.WORKER_SECRET || "").trim();
  const receivedSecret = (req.headers.get("x-worker-secret") || "").trim();
  return Boolean(expectedSecret) && receivedSecret === expectedSecret;
}
