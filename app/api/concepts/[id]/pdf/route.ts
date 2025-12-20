import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ConceptModel } from "@/models/Concept";

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  if (process.env.ENABLE_SERVER_PDF !== "1") {
    return NextResponse.json({ error: "Server PDF disabled. Use browser export." }, { status: 501 });
  }

  const params = await context.params;
  const conceptId = params.id;

  if (!Types.ObjectId.isValid(conceptId)) {
    return NextResponse.json({ error: "Invalid concept id" }, { status: 400 });
  }

  await connectMongo();
  const concept = await ConceptModel.findById(conceptId).select({ _id: 1 }).lean();
  if (!concept) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  let chromium: any = null;
  try {
    const moduleName = "playwright";
    // Use eval to avoid static analysis; this will throw at runtime if not installed
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const req = eval("require") as NodeRequire;
    const pw = req ? (req(moduleName) as { chromium?: unknown }) : null;
    chromium = pw?.chromium;
  } catch (err) {
    console.error("Playwright not available for server PDF", err);
    return NextResponse.json({ error: "Server PDF not available (missing playwright)" }, { status: 501 });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1800 },
  });

  try {
    const origin = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
    const exportUrl = `${origin}/admin/concepts/${conceptId}/export`;
    await page.goto(exportUrl, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "20mm", bottom: "18mm", left: "20mm" },
    });
    await browser.close();
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="concept-${conceptId}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Failed to generate PDF", err);
    await browser.close();
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
