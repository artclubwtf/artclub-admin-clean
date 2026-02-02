type ShopifyCustomer = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type ShopifyCustomerInput = {
  email: string;
  firstName?: string;
  lastName?: string;
};

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function callShopifyAdmin(query: string, variables: Record<string, unknown>) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = mustEnv("SHOPIFY_API_VERSION");
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

export async function findCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  const query = `
    query CustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            email
            firstName
            lastName
          }
        }
      }
    }
  `;

  const data = await callShopifyAdmin(query, { query: `email:${email}` });
  const edge = data?.customers?.edges?.[0];
  const node = edge?.node;
  if (!node?.id) return null;
  return {
    id: node.id,
    email: node.email ?? null,
    firstName: node.firstName ?? null,
    lastName: node.lastName ?? null,
  };
}

export async function createCustomer(input: ShopifyCustomerInput): Promise<ShopifyCustomer> {
  const mutation = `
    mutation CustomerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
          firstName
          lastName
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const payload: Record<string, string> = { email: input.email };
  if (input.firstName) payload.firstName = input.firstName;
  if (input.lastName) payload.lastName = input.lastName;

  const data = await callShopifyAdmin(mutation, { input: payload });
  const result = data?.customerCreate;
  const errors = result?.userErrors || [];
  if (errors.length) {
    const message = errors.map((e: { message?: string }) => e.message).filter(Boolean).join("; ") || "Unknown error";
    throw new Error(`Shopify customerCreate error: ${message}`);
  }

  const customer = result?.customer;
  if (!customer?.id) {
    throw new Error("Shopify customerCreate returned no customer id");
  }

  return {
    id: customer.id,
    email: customer.email ?? null,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
  };
}
