import { NonRetriableError } from "inngest";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { BlockedRequestError, safeFetch } from "@/lib/ssrf";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret, parseJsonField } from "../../lib/integration";

// The Shopify and WooCommerce nodes. Each operation is first turned into a
// plain request (method, address, body) by a function that touches nothing,
// so what would be sent can be tested; one sender then makes the call.

type StoreData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

export type StoreRequest = {
  method: "GET" | "POST" | "PUT";
  url: string;
  body?: unknown;
  // What the node returns, from what the store answered
  shape: (response: any) => unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const STORE_DEFAULT_LIMIT = 20;
// Also the most items the nodes after a list run for (MAX_ITEMS_PER_NODE)
export const STORE_MAX_LIMIT = 100;

// A list of whole orders is large: more than this is refused with advice,
// instead of failing later where the run's data is stored
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

// Reads a node's fields, with the checks every operation needs
const createReader = (label: string, data: StoreData, context: WorkflowContext) => {
  const field = (name: string) => renderTemplate(data[name], context).trim();

  const required = (name: string, title: string) => {
    const value = field(name);
    if (!value) {
      throw new NonRetriableError(`${label} node: ${title} is required`);
    }
    return value;
  };

  // An id goes into the address, so it can only be a number. Shopify's
  // "gid://shopify/Order/123" form is accepted too.
  const id = (name: string, title: string) => {
    const value = required(name, title).replace(/^gid:\/\/shopify\/\w+\//i, "");
    if (!/^\d{1,20}$/.test(value)) {
      throw new NonRetriableError(
        `${label} node: ${title} must be a number, for example 450789469`
      );
    }
    return value;
  };

  const jsonObject = (name: string, title: string): Record<string, unknown> => {
    const text = field(name);
    if (!text) return {};

    const parsed = parseJsonField<unknown>(label, title, text);
    if (!isRecord(parsed)) {
      throw new NonRetriableError(`${label} node: ${title} must be a JSON object`);
    }
    return parsed;
  };

  const limit = () => {
    const count = Math.floor(Number(field("limit")));

    return Number.isFinite(count) && count >= 1
      ? Math.min(count, STORE_MAX_LIMIT)
      : STORE_DEFAULT_LIMIT;
  };

  const number = (name: string, title: string) => {
    const value = Number(required(name, title));
    if (!Number.isFinite(value)) {
      throw new NonRetriableError(`${label} node: ${title} must be a number`);
    }
    return value;
  };

  // A date the user typed, as the ISO text both APIs take
  const date = (name: string, title: string) => {
    const value = field(name);
    if (!value) return "";

    const time = Date.parse(value);
    if (!Number.isFinite(time)) {
      throw new NonRetriableError(
        `${label} node: ${title} must be a date, for example 2026-01-31 or 2026-01-31T09:00:00Z`
      );
    }
    return new Date(time).toISOString();
  };

  return { field, required, id, jsonObject, limit, number, date };
};

// Only the entries that were filled in
const filled = (entries: Record<string, string>) =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value));

const withQuery = (address: string, query: Record<string, string>) => {
  const url = new URL(address);

  for (const [name, value] of Object.entries(filled(query))) {
    url.searchParams.set(name, value);
  }

  return url.toString();
};

const list = (items: unknown) => {
  const entries = Array.isArray(items) ? items : [];

  return { items: entries, count: entries.length };
};

const fieldList = (text: string) =>
  text
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .join(",");

// =========================================================================
// SHOPIFY (Admin REST API)
// =========================================================================
// Shopify answers a request for a version it no longer serves with its
// oldest supported one, so an old default keeps working.
export const SHOPIFY_API_VERSION = "2025-01";

/**
 * "my-store", "my-store.myshopify.com" or the admin's address, as the
 * store's myshopify.com host. Nothing else is accepted: the access token is
 * only ever sent to Shopify.
 */
export const normalizeShopDomain = (value: string): string | null => {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^admin\.shopify\.com\/store\//, "")
    .replace(/[/?#].*$/, "");

  const domain = host.includes(".") ? host : `${host}.myshopify.com`;

  return /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(domain) ? domain : null;
};

const SHOPIFY_DEFAULT_OPERATION = "get_order";

export const buildShopifyRequest = (
  data: StoreData,
  context: WorkflowContext,
  now: number = Date.now()
): StoreRequest => {
  const read = createReader("Shopify", data, context);
  const operation = data.operation || SHOPIFY_DEFAULT_OPERATION;

  const domain = normalizeShopDomain(read.required("shopDomain", "Shop Domain"));
  if (!domain) {
    throw new NonRetriableError(
      "Shopify node: Shop Domain must be the store's myshopify.com address, for example my-store.myshopify.com"
    );
  }

  const version = read.field("apiVersion") || SHOPIFY_API_VERSION;
  if (!/^\d{4}-\d{2}$/.test(version)) {
    throw new NonRetriableError(
      "Shopify node: API Version must look like 2025-01"
    );
  }

  const base = `https://${domain}/admin/api/${version}`;
  const fields = fieldList(read.field("fields"));
  const extra = () => read.jsonObject("fieldsJson", "Additional Fields");

  switch (operation) {
    // ---------------------------------------------------------- orders
    case "get_order":
      return {
        method: "GET",
        url: withQuery(`${base}/orders/${read.id("orderId", "Order ID")}.json`, { fields }),
        shape: (response) => response.order ?? null,
      };

    case "list_orders":
      return {
        method: "GET",
        url: withQuery(`${base}/orders.json`, {
          // Shopify's own default leaves out closed and cancelled orders
          status: read.field("status") || "any",
          financial_status: read.field("financialStatus"),
          fulfillment_status: read.field("fulfillmentStatus"),
          created_at_min: read.date("createdAfter", "Created After"),
          limit: String(read.limit()),
          fields,
        }),
        shape: (response) => list(response.orders),
      };

    case "update_order": {
      const orderId = read.id("orderId", "Order ID");
      const order = {
        ...filled({
          note: read.field("note"),
          tags: read.field("tags"),
          email: read.field("email"),
        }),
        ...extra(),
      };

      if (Object.keys(order).length === 0) {
        throw new NonRetriableError("Shopify node: fill in at least one field to update");
      }

      return {
        method: "PUT",
        url: `${base}/orders/${orderId}.json`,
        body: { order: { ...order, id: Number(orderId) } },
        shape: (response) => response.order ?? null,
      };
    }

    // -------------------------------------------------------- products
    case "get_product":
      return {
        method: "GET",
        url: withQuery(`${base}/products/${read.id("productId", "Product ID")}.json`, { fields }),
        shape: (response) => response.product ?? null,
      };

    case "list_products":
      return {
        method: "GET",
        url: withQuery(`${base}/products.json`, {
          title: read.field("title"),
          status: read.field("productStatus"),
          limit: String(read.limit()),
          fields,
        }),
        shape: (response) => list(response.products),
      };

    case "create_product": {
      const variant = filled({ price: read.field("price"), sku: read.field("sku") });

      return {
        method: "POST",
        url: `${base}/products.json`,
        body: {
          product: {
            title: read.required("title", "Title"),
            ...filled({
              body_html: read.field("description"),
              vendor: read.field("vendor"),
              product_type: read.field("productType"),
              tags: read.field("tags"),
              status: read.field("productStatus"),
            }),
            ...(Object.keys(variant).length ? { variants: [variant] } : {}),
            ...extra(),
          },
        },
        shape: (response) => response.product ?? null,
      };
    }

    case "update_product": {
      const productId = read.id("productId", "Product ID");
      const product = {
        ...filled({
          title: read.field("title"),
          body_html: read.field("description"),
          vendor: read.field("vendor"),
          product_type: read.field("productType"),
          tags: read.field("tags"),
          status: read.field("productStatus"),
        }),
        ...extra(),
      };

      if (Object.keys(product).length === 0) {
        throw new NonRetriableError("Shopify node: fill in at least one field to update");
      }

      return {
        method: "PUT",
        url: `${base}/products/${productId}.json`,
        body: { product: { ...product, id: Number(productId) } },
        shape: (response) => response.product ?? null,
      };
    }

    // ------------------------------------------------------- customers
    case "get_customer":
      return {
        method: "GET",
        url: withQuery(`${base}/customers/${read.id("customerId", "Customer ID")}.json`, { fields }),
        shape: (response) => response.customer ?? null,
      };

    case "search_customers":
      return {
        method: "GET",
        url: withQuery(`${base}/customers/search.json`, {
          query: read.required("query", "Search"),
          limit: String(read.limit()),
          fields,
        }),
        shape: (response) => list(response.customers),
      };

    case "create_customer": {
      const customer = {
        ...filled({
          email: read.field("email"),
          phone: read.field("phone"),
          first_name: read.field("firstName"),
          last_name: read.field("lastName"),
          tags: read.field("tags"),
        }),
        ...extra(),
      };

      if (!customer.email && !customer.phone) {
        throw new NonRetriableError("Shopify node: Email or Phone is required");
      }

      return {
        method: "POST",
        url: `${base}/customers.json`,
        body: { customer },
        shape: (response) => response.customer ?? null,
      };
    }

    case "update_customer": {
      const customerId = read.id("customerId", "Customer ID");
      const customer = {
        ...filled({
          email: read.field("email"),
          phone: read.field("phone"),
          first_name: read.field("firstName"),
          last_name: read.field("lastName"),
          tags: read.field("tags"),
        }),
        ...extra(),
      };

      if (Object.keys(customer).length === 0) {
        throw new NonRetriableError("Shopify node: fill in at least one field to update");
      }

      return {
        method: "PUT",
        url: `${base}/customers/${customerId}.json`,
        body: { customer: { ...customer, id: Number(customerId) } },
        shape: (response) => response.customer ?? null,
      };
    }

    // ------------------------------------------------------- inventory
    case "list_locations":
      return {
        method: "GET",
        url: `${base}/locations.json`,
        shape: (response) => list(response.locations),
      };

    case "get_inventory": {
      const itemId = read.id("inventoryItemId", "Inventory Item ID");
      const locationId = read.field("locationId") ? read.id("locationId", "Location ID") : "";

      return {
        method: "GET",
        url: withQuery(`${base}/inventory_levels.json`, {
          inventory_item_ids: itemId,
          location_ids: locationId,
        }),
        shape: (response) => {
          const levels = list(response.inventory_levels);

          return {
            ...levels,
            // Across every location that was asked for
            available: levels.items.reduce(
              (total: number, level: any) => total + (Number(level?.available) || 0),
              0
            ),
          };
        },
      };
    }

    case "set_inventory":
    case "adjust_inventory": {
      const quantity = read.number("quantity", "Quantity");
      if (!Number.isInteger(quantity)) {
        throw new NonRetriableError("Shopify node: Quantity must be a whole number");
      }

      return {
        method: "POST",
        url: `${base}/inventory_levels/${operation === "set_inventory" ? "set" : "adjust"}.json`,
        body: {
          location_id: Number(read.id("locationId", "Location ID")),
          inventory_item_id: Number(read.id("inventoryItemId", "Inventory Item ID")),
          ...(operation === "set_inventory"
            ? { available: quantity }
            : { available_adjustment: quantity }),
        },
        shape: (response) => response.inventory_level ?? null,
      };
    }

    // ------------------------------------------------ abandoned carts
    case "list_abandoned_checkouts": {
      const minutes = (name: string, title: string, fallback: number) => {
        const text = read.field(name);
        if (!text) return fallback;

        const value = Number(text);
        if (!Number.isFinite(value) || value < 0) {
          throw new NonRetriableError(`Shopify node: ${title} must be a number of minutes`);
        }
        return value;
      };

      const newest = minutes("minAgeMinutes", "Abandoned At Least", 60);
      const oldest = minutes("maxAgeMinutes", "Abandoned At Most", 0);

      if (oldest && oldest <= newest) {
        throw new NonRetriableError(
          "Shopify node: Abandoned At Most must be more minutes than Abandoned At Least"
        );
      }

      const contactOnly = data.contactOnly !== "false";

      return {
        method: "GET",
        url: withQuery(`${base}/checkouts.json`, {
          // Open: started and never completed
          status: "open",
          updated_at_max: new Date(now - newest * 60_000).toISOString(),
          updated_at_min: oldest ? new Date(now - oldest * 60_000).toISOString() : "",
          limit: String(read.limit()),
        }),
        shape: (response) =>
          list(
            (Array.isArray(response.checkouts) ? response.checkouts : []).filter(
              (checkout: any) =>
                // A checkout that was completed after all is not abandoned
                !checkout?.completed_at &&
                (!contactOnly || !!checkout?.email || !!checkout?.phone)
            )
          ),
      };
    }

    default:
      throw new NonRetriableError(`Shopify node: Unsupported operation "${operation}"`);
  }
};

// Shopify's errors are a text, or the messages per field
const describeShopifyError = (payload: any): string => {
  const errors = payload?.errors ?? payload?.error;

  if (typeof errors === "string") return errors;

  if (isRecord(errors)) {
    return Object.entries(errors)
      .map(([name, messages]) => `${name}: ${[messages].flat().join(", ")}`)
      .join("; ");
  }

  return "";
};

// =========================================================================
// WOOCOMMERCE (REST API v3)
// =========================================================================
/**
 * The store's address as https://host[/folder]. Only https: the consumer
 * key and secret are sent with every request.
 */
export const normalizeStoreUrl = (value: string): string | null => {
  const text = value.trim().replace(/\/wp-json(\/.*)?$/i, "").replace(/\/+$/, "");

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    return null;
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
};

const WOOCOMMERCE_DEFAULT_OPERATION = "get_order";

export const buildWoocommerceRequest = (
  data: StoreData,
  context: WorkflowContext
): StoreRequest => {
  const read = createReader("WooCommerce", data, context);
  const operation = data.operation || WOOCOMMERCE_DEFAULT_OPERATION;

  const storeUrl = normalizeStoreUrl(read.required("storeUrl", "Store URL"));
  if (!storeUrl) {
    throw new NonRetriableError(
      "WooCommerce node: Store URL must be the shop's https address, for example https://shop.example.com"
    );
  }

  const base = `${storeUrl}/wp-json/wc/v3`;
  const fields = fieldList(read.field("fields"));
  const extra = () => read.jsonObject("fieldsJson", "Additional Fields");
  const listQuery = () => ({ per_page: String(read.limit()), _fields: fields });

  const notEmpty = (body: Record<string, unknown>) => {
    if (Object.keys(body).length === 0) {
      throw new NonRetriableError("WooCommerce node: fill in at least one field to update");
    }
    return body;
  };

  switch (operation) {
    // ---------------------------------------------------------- orders
    case "get_order":
      return {
        method: "GET",
        url: withQuery(`${base}/orders/${read.id("orderId", "Order ID")}`, { _fields: fields }),
        shape: (response) => response,
      };

    case "list_orders":
      return {
        method: "GET",
        url: withQuery(`${base}/orders`, {
          status: read.field("status"),
          search: read.field("search"),
          after: read.date("createdAfter", "Created After"),
          ...listQuery(),
        }),
        shape: list,
      };

    case "update_order":
      return {
        method: "PUT",
        url: `${base}/orders/${read.id("orderId", "Order ID")}`,
        body: notEmpty({
          ...filled({
            status: read.field("status"),
            customer_note: read.field("customerNote"),
          }),
          ...extra(),
        }),
        shape: (response) => response,
      };

    case "add_order_note":
      return {
        method: "POST",
        url: `${base}/orders/${read.id("orderId", "Order ID")}/notes`,
        body: {
          note: read.required("note", "Note"),
          // True: the customer is emailed the note
          customer_note: data.noteForCustomer === "true",
        },
        shape: (response) => response,
      };

    // -------------------------------------------------------- products
    case "get_product":
      return {
        method: "GET",
        url: withQuery(`${base}/products/${read.id("productId", "Product ID")}`, { _fields: fields }),
        shape: (response) => response,
      };

    case "list_products":
      return {
        method: "GET",
        url: withQuery(`${base}/products`, {
          search: read.field("search"),
          sku: read.field("sku"),
          status: read.field("productStatus"),
          ...listQuery(),
        }),
        shape: list,
      };

    case "create_product":
    case "update_product": {
      const creating = operation === "create_product";
      const productId = creating ? "" : read.id("productId", "Product ID");
      const stock = read.field("stockQuantity");

      if (stock && !/^-?\d+$/.test(stock)) {
        throw new NonRetriableError("WooCommerce node: Stock Quantity must be a whole number");
      }

      const product = {
        ...filled({
          name: creating ? read.required("name", "Name") : read.field("name"),
          regular_price: read.field("price"),
          description: read.field("description"),
          sku: read.field("sku"),
          status: read.field("productStatus"),
        }),
        // A quantity only counts when the product's stock is managed
        ...(stock ? { manage_stock: true, stock_quantity: Number(stock) } : {}),
        ...extra(),
      };

      return creating
        ? {
            method: "POST",
            url: `${base}/products`,
            body: product,
            shape: (response) => response,
          }
        : {
            method: "PUT",
            url: `${base}/products/${productId}`,
            body: notEmpty(product),
            shape: (response) => response,
          };
    }

    // ------------------------------------------------------- customers
    case "get_customer":
      return {
        method: "GET",
        url: withQuery(`${base}/customers/${read.id("customerId", "Customer ID")}`, { _fields: fields }),
        shape: (response) => response,
      };

    case "list_customers":
      return {
        method: "GET",
        url: withQuery(`${base}/customers`, {
          email: read.field("email"),
          search: read.field("search"),
          ...listQuery(),
        }),
        shape: list,
      };

    case "create_customer":
    case "update_customer": {
      const creating = operation === "create_customer";
      const customerId = creating ? "" : read.id("customerId", "Customer ID");

      const customer = {
        ...filled({
          email: creating ? read.required("email", "Email") : read.field("email"),
          first_name: read.field("firstName"),
          last_name: read.field("lastName"),
        }),
        ...extra(),
      };

      return creating
        ? {
            method: "POST",
            url: `${base}/customers`,
            body: customer,
            shape: (response) => response,
          }
        : {
            method: "PUT",
            url: `${base}/customers/${customerId}`,
            body: notEmpty(customer),
            shape: (response) => response,
          };
    }

    default:
      throw new NonRetriableError(`WooCommerce node: Unsupported operation "${operation}"`);
  }
};

// WordPress puts the reason in "message", sometimes with HTML in it
const describeWoocommerceError = (payload: any): string =>
  typeof payload?.message === "string"
    ? payload.message.replace(/<[^>]*>/g, "").trim()
    : "";

// =========================================================================
// SENDING
// =========================================================================
const readBody = async (label: string, response: Response): Promise<string> => {
  const tooLarge = () =>
    new NonRetriableError(
      `${label} node: the answer is larger than ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB. Lower Limit, or name the fields you need in Fields.`
    );

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw tooLarge();
    return text;
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
};

/**
 * Makes the call and returns the parsed answer. A redirect is not followed:
 * the request carries the store's key, and where a store sends it on is not
 * for this server to trust.
 */
export const sendStoreRequest = async ({
  label,
  request,
  headers,
  redirectHint,
  describeError,
}: {
  label: string;
  request: Pick<StoreRequest, "method" | "url" | "body">;
  headers: Record<string, string>;
  redirectHint: string;
  describeError: (payload: any) => string;
}): Promise<any> => {
  const response = await safeFetch(request.url, {
    method: request.method,
    headers: {
      Accept: "application/json",
      ...(request.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});

    let host = "";
    try {
      host = new URL(response.headers.get("location") ?? "", request.url).host;
    } catch {
      // No usable Location: the message goes without it
    }

    throw new NonRetriableError(
      `${label} node: the store redirected the request${host ? ` to ${host}` : ""}. ${redirectHint}`
    );
  }

  const text = await readBody(label, response);

  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (a login page, a firewall's page): reported below
  }

  if (!response.ok) {
    const detail =
      describeError(payload) ||
      (payload === null ? text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "") ||
      response.statusText;

    throw new NonRetriableError(
      `${label} API error [${response.status}]: ${detail}${
        response.status === 429 ? " (too many requests: slow the workflow down or lower Limit)" : ""
      }`
    );
  }

  if (payload === null && text) {
    throw new NonRetriableError(
      `${label} node: the store did not answer with JSON. Check the address.`
    );
  }

  return payload ?? {};
};

const toStoreError = (label: string, error: any): NonRetriableError => {
  if (error instanceof NonRetriableError) return error;

  if (error instanceof BlockedRequestError) {
    return new NonRetriableError(`${label} node: ${error.message}`);
  }

  return new NonRetriableError(
    error?.name === "TimeoutError"
      ? `${label} node failed: the store did not answer in time`
      : `${label} node failed: ${error?.message}${error?.cause?.message ? ` (${error.cause.message})` : ""}`
  );
};

/**
 * Works with a Shopify store's orders, products, customers and inventory,
 * and lists its abandoned checkouts.
 */
export const shopifyExecutor: NodeExecutor<StoreData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "shopify";
  const operation = data.operation || SHOPIFY_DEFAULT_OPERATION;

  // Every check of the fields comes before the credential is read
  buildShopifyRequest(data, context);

  const token = await loadCredentialSecret({
    step,
    stepId: `shopify-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "Shopify",
  });

  try {
    const result = await step.run(`shopify-${nodeId}-${operation}`, async () => {
      // Built here, so "minutes ago" counts from when the call is made
      const request = buildShopifyRequest(data, context);

      const response = await sendStoreRequest({
        label: "Shopify",
        request,
        headers: { "X-Shopify-Access-Token": token },
        redirectHint:
          "Use the store's current myshopify.com address as Shop Domain.",
        describeError: describeShopifyError,
      });

      return request.shape(response);
    });

    return { ...context, [variableName]: result };
  } catch (error) {
    throw toStoreError("Shopify", error);
  }
};

/**
 * Works with a WooCommerce store's orders, products and customers.
 */
export const woocommerceExecutor: NodeExecutor<StoreData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "woocommerce";
  const operation = data.operation || WOOCOMMERCE_DEFAULT_OPERATION;

  const request = buildWoocommerceRequest(data, context);

  // Stored as "consumer key:consumer secret"
  const secret = await loadCredentialSecret({
    step,
    stepId: `woocommerce-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "WooCommerce",
  });

  if (!/^[^:\s]+:[^:\s]+$/.test(secret)) {
    throw new NonRetriableError(
      'WooCommerce node: the credential must look like "ck_your-consumer-key:cs_your-consumer-secret"'
    );
  }

  try {
    const result = await step.run(`woocommerce-${nodeId}-${operation}`, async () => {
      const response = await sendStoreRequest({
        label: "WooCommerce",
        request,
        headers: {
          Authorization: `Basic ${Buffer.from(secret, "utf8").toString("base64")}`,
        },
        redirectHint:
          "Use the address the shop really answers on as Store URL (with or without www).",
        describeError: describeWoocommerceError,
      });

      return request.shape(response);
    });

    return { ...context, [variableName]: result };
  } catch (error) {
    throw toStoreError("WooCommerce", error);
  }
};
