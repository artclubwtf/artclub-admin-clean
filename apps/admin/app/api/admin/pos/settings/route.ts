import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { getOrCreatePosSettings, mapPosSettingsDocToSnapshot } from "@/lib/pos/settings";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosLocationModel } from "@/models/PosLocation";
import { POS_SETTINGS_SCOPE, PosSettingsModel, currentSettingsEnvironment } from "@/models/PosSettings";
import { PosTerminalModel } from "@/models/PosTerminal";

const createLocationSchema = z.object({
  action: z.literal("create_location"),
  name: z.string().trim().min(1, "location_name_required"),
  address: z.string().trim().min(1, "location_address_required"),
});

const createTerminalSchema = z
  .object({
    action: z.literal("create_terminal"),
    locationId: z.string().trim().min(1, "location_id_required"),
    mode: z.enum(["bridge", "external"]).default("bridge"),
    provider: z.string().trim().min(1, "provider_required"),
    terminalRef: z.string().trim().min(1, "terminal_ref_required"),
    label: z.string().trim().min(1, "terminal_label_required"),
    name: z.string().trim().optional(),
    host: z.string().trim().optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    zvtPassword: z.string().trim().optional(),
    isActive: z.boolean().optional(),
    agentId: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "bridge" && !value.host?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "terminal_host_required_for_bridge", path: ["host"] });
    }
  });

const saveBrandingLegalSchema = z.object({
  action: z.literal("save_branding_legal"),
  brandName: z.string().trim().min(1, "brand_name_required"),
  logoUrl: z.string().trim().optional(),
  seller: z.object({
    companyName: z.string().trim().min(1, "seller_company_name_required"),
    addressLine1: z.string().trim().min(1, "seller_address_line1_required"),
    addressLine2: z.string().trim().min(1, "seller_address_line2_required"),
    email: z.string().trim().email("seller_email_invalid"),
    phone: z.string().trim().min(1, "seller_phone_required"),
  }),
  tax: z
    .object({
      steuernummer: z.string().trim().optional(),
      ustId: z.string().trim().optional(),
      finanzamt: z.string().trim().optional(),
    })
    .optional(),
  receiptFooterLines: z.array(z.string()).max(20, "too_many_footer_lines").optional(),
  locale: z.string().trim().min(2, "locale_required").optional(),
  currency: z.string().trim().min(3, "currency_required").max(3, "currency_required").optional(),
});

function normalizeString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function readSettingsPayload() {
  const [locations, terminals, posSettings] = await Promise.all([
    PosLocationModel.find({}).sort({ name: 1 }).lean(),
    PosTerminalModel.find({}).sort({ label: 1 }).lean(),
    getOrCreatePosSettings(),
  ]);

  return {
    terminals: terminals.map((terminal) => ({
      id: terminal._id.toString(),
      locationId: terminal.locationId.toString(),
      provider: terminal.provider,
      terminalRef: terminal.terminalRef,
      name: terminal.name ?? terminal.label,
      label: terminal.label,
      host: terminal.host ?? null,
      port: typeof terminal.port === "number" ? terminal.port : 22000,
      mode: terminal.mode ?? "bridge",
      agentId: terminal.agentId ? terminal.agentId.toString() : null,
      isActive: terminal.isActive ?? true,
      status: terminal.status,
      lastSeenAt: terminal.lastSeenAt ?? null,
    })),
    locations: locations.map((location) => ({
      id: location._id.toString(),
      name: location.name,
      address: location.address,
    })),
    tax: {
      defaultRate: null,
    },
    invoiceThresholds: {
      receiptOnlyMax: null,
      invoiceRequiredFrom: null,
    },
    brandingLegal: posSettings,
  };
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  await connectMongo();
  const settings = await readSettingsPayload();

  return NextResponse.json(
    {
      ok: true,
      settings,
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as unknown;
  const action = typeof body === "object" && body !== null && "action" in body ? (body as { action?: unknown }).action : null;

  await connectMongo();

  if (action === "create_location") {
    const parsed = createLocationSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    try {
      await PosLocationModel.create({
        name: parsed.data.name,
        address: parsed.data.address,
      });
      const settings = await readSettingsPayload();
      return NextResponse.json({ ok: true, settings }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed_to_create_location";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  if (action === "create_terminal") {
    const parsed = createTerminalSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const locationExists = await PosLocationModel.exists({ _id: parsed.data.locationId });
    if (!locationExists) {
      return NextResponse.json({ ok: false, error: "location_not_found" }, { status: 404 });
    }

    try {
      await PosTerminalModel.create({
        locationId: parsed.data.locationId,
        provider: parsed.data.provider,
        terminalRef: parsed.data.terminalRef,
        label: parsed.data.label,
        name: normalizeString(parsed.data.name),
        mode: parsed.data.mode,
        host: parsed.data.mode === "bridge" ? normalizeString(parsed.data.host) : undefined,
        port: parsed.data.port ?? 22000,
        zvtPassword: normalizeString(parsed.data.zvtPassword),
        isActive: parsed.data.isActive ?? true,
        status: parsed.data.isActive === false ? "inactive" : "ready",
        agentId: normalizeString(parsed.data.agentId),
      });

      const settings = await readSettingsPayload();
      return NextResponse.json({ ok: true, settings }, { status: 201 });
    } catch (error) {
      const duplicateKey = typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code === 11000;
      if (duplicateKey) {
        return NextResponse.json({ ok: false, error: "terminal_provider_ref_exists" }, { status: 409 });
      }
      const message = error instanceof Error ? error.message : "failed_to_create_terminal";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  if (action === "save_branding_legal") {
    const parsed = saveBrandingLegalSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const data = parsed.data;
    const trimOptional = (value?: string) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    };

    try {
      const environment = currentSettingsEnvironment();
      const updated = await PosSettingsModel.findOneAndUpdate(
        { scope: POS_SETTINGS_SCOPE, environment },
        {
          $set: {
            brandName: data.brandName.trim(),
            logoUrl: trimOptional(data.logoUrl),
            seller: {
              companyName: data.seller.companyName.trim(),
              addressLine1: data.seller.addressLine1.trim(),
              addressLine2: data.seller.addressLine2.trim(),
              email: data.seller.email.trim(),
              phone: data.seller.phone.trim(),
            },
            tax: {
              steuernummer: trimOptional(data.tax?.steuernummer),
              ustId: trimOptional(data.tax?.ustId),
              finanzamt: trimOptional(data.tax?.finanzamt),
            },
            receiptFooterLines: (data.receiptFooterLines || []).map((line) => line.trim()).filter(Boolean),
            locale: trimOptional(data.locale) || "de-DE",
            currency: (trimOptional(data.currency) || "EUR").toUpperCase(),
          },
          $setOnInsert: { scope: POS_SETTINGS_SCOPE, environment },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();

      const settings = await readSettingsPayload();
      return NextResponse.json(
        { ok: true, settings, brandingLegal: mapPosSettingsDocToSnapshot(updated), message: "branding_legal_saved" },
        { status: 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed_to_save_branding_legal";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
