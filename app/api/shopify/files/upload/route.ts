import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type StagedUploadTarget = {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function sanitizeFilename(name: string, mimeType: string) {
  const fallbackExt = mimeType.split("/")[1] || "img";
  const safeBase = (name || "upload").trim() || "upload";
  const normalized = safeBase.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized.includes(".") ? normalized : `${normalized}.${fallbackExt}`;
}

function looksLikeImage(file: File) {
  if (file.type && file.type.startsWith("image/")) return true;
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"].some((ext) => name.endsWith(ext));
}

async function callShopifyAdmin(query: string, variables: any) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = JSON.parse(text) as any;
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as any;
}

async function createStagedUpload(file: File, filename: string): Promise<StagedUploadTarget> {
  const mutation = `
    mutation StagedUploads($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    input: [
      {
        resource: "FILE",
        filename,
        mimeType: file.type || "image/*",
        fileSize: String(file.size),
        httpMethod: "POST",
      },
    ],
  };

  const data = await callShopifyAdmin(mutation, variables);
  const payload = data?.stagedUploadsCreate;

  if (!payload) throw new Error("Shopify stagedUploadsCreate returned no data");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "Staging upload failed";
    throw new Error(message);
  }

  const target = (payload.stagedTargets || [])[0] as StagedUploadTarget | undefined;
  if (!target?.url || !target?.resourceUrl) {
    throw new Error("Shopify staged upload target missing url");
  }

  return target;
}

async function finalizeFileUpload(staged: StagedUploadTarget, file: File, filename: string) {
  const uploadForm = new FormData();
  for (const param of staged.parameters || []) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);

  const uploadRes = await fetch(staged.url, {
    method: "POST",
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`Failed to upload file to Shopify storage (${uploadRes.status}): ${text || uploadRes.statusText}`);
  }

  const mutation = `
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          preview {
            image { url }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    files: [
      {
        originalSource: staged.resourceUrl,
        contentType: "IMAGE",
        filename,
      },
    ],
  };

  const data = await callShopifyAdmin(mutation, variables);
  const payload = data?.fileCreate;
  if (!payload) throw new Error("Shopify fileCreate returned no data");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "fileCreate failed";
    throw new Error(message);
  }

  const created = (payload.files || [])[0] as any;
  if (!created?.id) throw new Error("Shopify did not return a file id");

  return {
    id: created.id as string,
    url: created.preview?.image?.url || null,
    filename,
  };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!looksLikeImage(file)) {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    const filename = sanitizeFilename(typeof file.name === "string" ? file.name : "upload", file.type || "image/*");

    const staged = await createStagedUpload(file, filename);
    const created = await finalizeFileUpload(staged, file, filename);

    return NextResponse.json(
      {
        fileIdGid: created.id,
        url: created.url,
        filename: created.filename,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Failed to upload Shopify file", err);
    return NextResponse.json({ error: err?.message || "Failed to upload file" }, { status: 500 });
  }
}
