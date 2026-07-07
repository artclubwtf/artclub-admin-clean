import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { imageUploadMaxBytes, processImageUpload } from "../lib/server/image-upload";

describe("image upload processing", () => {
  it("creates a square, metadata-free WebP avatar", async () => {
    const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#884422" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processImageUpload(input, "avatar");
    const metadata = await sharp(result.buffer).metadata();
    expect(result.mimeType).toBe("image/webp");
    expect([result.width, result.height]).toEqual([256, 256]);
    expect(metadata.exif).toBeUndefined();
  });

  it("uses a 4:5 web variant for event flyers", async () => {
    const input = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#223344" } }).jpeg().toBuffer();
    const result = await processImageUpload(input, "event-cover");
    expect([result.width, result.height]).toEqual([1280, 1600]);
    expect(result.mimeType).toBe("image/webp");
  });

  it("keeps artwork resolution and uses a higher-quality output", async () => {
    const input = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    const result = await processImageUpload(input, "artwork");
    expect([result.width, result.height]).toEqual([1200, 800]);
    expect(result.mimeType).toBe("image/jpeg");
    expect(imageUploadMaxBytes("artwork")).toBeGreaterThan(imageUploadMaxBytes("post"));
  });

  it("rejects SVG and non-image payloads", async () => {
    await expect(processImageUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "post")).rejects.toMatchObject({ code: "invalid_image_data" });
    await expect(processImageUpload(Buffer.from("not an image"), "post")).rejects.toMatchObject({ code: "invalid_image_data" });
  });
});
