type RequestJsonOptions = RequestInit & {
  retries?: number;
  retryDelayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableResponse(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function requestJson<T>(input: string, init: RequestJsonOptions = {}) {
  const { retries = 1, retryDelayMs = 400, ...requestInit } = init;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, requestInit);
      const json = (await response.json().catch(() => null)) as T | null;
      if (response.ok || attempt >= retries || !isRetryableResponse(response.status)) {
        return { response, json };
      }
      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        throw error;
      }
    }

    await sleep(retryDelayMs * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
