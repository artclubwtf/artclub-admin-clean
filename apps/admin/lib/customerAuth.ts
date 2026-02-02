import { compare, hash } from "bcryptjs";

import { createCustomerSession, deleteCustomerSession, getCustomerSession } from "@/lib/customerSessions";
import { connectMongo } from "@/lib/mongodb";
import { createCustomer, findCustomerByEmail } from "@/lib/shopify.customers";
import { resolveShopDomain } from "@/lib/shopDomain";
import { UserModel } from "@/models/User";

export type CustomerUserPayload = {
  id: string;
  email: string;
  role: string;
  name?: string;
  shopDomain?: string;
  shopifyCustomerGid: string | null;
  createdAt?: Date;
};

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: undefined, lastName: undefined };
  const [firstName, ...rest] = parts;
  const lastName = rest.join(" ").trim();
  return { firstName, lastName: lastName || undefined };
}

function toCustomerUserPayload(user: {
  _id: { toString(): string };
  email: string;
  role: string;
  name?: string | null;
  shopDomain?: string | null;
  shopifyCustomerGid?: string | null;
  createdAt?: Date | null;
}): CustomerUserPayload {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name ?? undefined,
    shopDomain: user.shopDomain ?? undefined,
    shopifyCustomerGid: user.shopifyCustomerGid ?? null,
    createdAt: user.createdAt ?? undefined,
  };
}

export async function registerCustomer(input: { email: string; password: string; name: string }) {
  const email = input.email.toLowerCase();
  const name = input.name.trim();
  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    throw new Error("missing_shop_domain");
  }

  await connectMongo();
  const existing = await UserModel.findOne({ email }).select({ _id: 1 }).lean();
  if (existing) {
    throw new Error("email_exists");
  }

  const passwordHash = await hash(input.password, 12);
  const user = await UserModel.create({
    email,
    role: "customer",
    name,
    shopDomain,
    shopifyCustomerGid: null,
    passwordHash,
    mustChangePassword: false,
    isActive: true,
  });

  let shopifyCustomerGid: string | null = null;
  let warning: string | undefined;

  try {
    const { firstName, lastName } = splitName(name);
    const existingCustomer = await findCustomerByEmail(email);
    if (existingCustomer?.id) {
      shopifyCustomerGid = existingCustomer.id;
      if (process.env.NODE_ENV !== "production") {
        console.log("linked customer gid", shopifyCustomerGid);
      }
    } else {
      const createdCustomer = await createCustomer({ email, firstName, lastName });
      shopifyCustomerGid = createdCustomer.id;
      if (process.env.NODE_ENV !== "production") {
        console.log("created customer gid", shopifyCustomerGid);
      }
    }

    await UserModel.updateOne({ _id: user._id }, { shopifyCustomerGid });
  } catch (err) {
    warning = "Shopify customer sync failed";
    shopifyCustomerGid = null;
    try {
      await UserModel.updateOne({ _id: user._id }, { shopifyCustomerGid: null });
    } catch (updateErr) {
      console.error("Failed to store Shopify customer gid", updateErr);
    }
    console.error("Failed to sync Shopify customer", err);
  }

  const session = await createCustomerSession(user._id.toString());
  const payload = toCustomerUserPayload({ ...user.toObject(), shopifyCustomerGid });

  return { user: payload, token: session.token, warning };
}

export async function loginCustomer(input: { email: string; password: string }) {
  const email = input.email.toLowerCase();
  await connectMongo();
  const user = await UserModel.findOne({ email, role: "customer" }).lean();
  if (!user || !user.isActive) return null;

  const isValid = await compare(input.password, user.passwordHash);
  if (!isValid) return null;

  const session = await createCustomerSession(user._id.toString());
  return { user: toCustomerUserPayload(user), token: session.token };
}

export async function getCustomerUserBySessionToken(token: string) {
  const session = await getCustomerSession(token);
  if (!session) return null;

  await connectMongo();
  const user = await UserModel.findById(session.userId).lean();
  if (!user || !user.isActive || user.role !== "customer") {
    await deleteCustomerSession(token);
    return null;
  }

  return toCustomerUserPayload(user);
}
