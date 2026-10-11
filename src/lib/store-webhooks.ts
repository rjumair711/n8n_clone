import { createHash } from "crypto";
import {
    ANY_EVENT,
    WOOCOMMERCE_PAID_EVENT,
} from "@/features/executions/lib/store-options";

// What the Shopify and WooCommerce triggers do with a delivery once its
// signature is verified: which events a trigger node listens for, the data
// a run starts with, and the key that stops the same event starting two
// runs. No database and no network here, so all of it can be tested.

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) =>
    typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

const firstText = (...values: unknown[]) => values.map(text).find(Boolean) ?? "";

const record = (value: unknown) => (isRecord(value) ? value : {});

const bodyHash = (rawBody: string) =>
    createHash("sha256").update(rawBody, "utf8").digest("hex");

// =========================================================================
// SHOPIFY
// =========================================================================
// "orders/paid" -> "order": the name the payload gets in the run's data
const SHOPIFY_RESOURCE_KEYS: Record<string, string> = {
    orders: "order",
    products: "product",
    customers: "customer",
    checkouts: "checkout",
};

/**
 * Whether a trigger node set to `selected` listens for `topic`. A node saved
 * without an event listens for everything.
 */
export const matchesShopifyEvent = (selected: unknown, topic: string): boolean => {
    const event = text(selected);

    return !event || event === ANY_EVENT || event === topic;
};

/**
 * The buyer's contact details, wherever the payload has them: an order has
 * a phone number in up to five places.
 */
const shopifyContact = (body: Record<string, unknown>) => {
    const customer = record(body.customer);
    const shipping = record(body.shipping_address);
    const billing = record(body.billing_address);
    const defaultAddress = record(customer.default_address);

    return {
        email: firstText(body.email, body.contact_email, customer.email),
        phone: firstText(
            body.phone,
            customer.phone,
            shipping.phone,
            billing.phone,
            defaultAddress.phone
        ),
        customerName:
            [firstText(customer.first_name, body.first_name), firstText(customer.last_name, body.last_name)]
                .filter(Boolean)
                .join(" ") || firstText(shipping.name, billing.name),
    };
};

export const buildShopifyTriggerData = ({
    topic,
    shopDomain,
    body,
}: {
    topic: string;
    shopDomain: string;
    body: unknown;
}) => {
    const payload = record(body);
    const resource = topic.split("/")[0] ?? "";

    return {
        event: topic,
        shopDomain,
        id: payload.id ?? null,
        ...shopifyContact(payload),
        // {{shopify.order.total_price}}, {{shopify.product.title}}...
        [SHOPIFY_RESOURCE_KEYS[resource] ?? "data"]: body,
    };
};

/**
 * Shopify sends an event again until it gets a 2xx answer, with the same
 * X-Shopify-Event-Id (and X-Shopify-Webhook-Id) each time.
 */
export const shopifyDedupeKey = ({
    topic,
    eventId,
    webhookId,
    rawBody,
}: {
    topic: string;
    eventId?: string | null;
    webhookId?: string | null;
    rawBody: string;
}) => `${topic}:${text(eventId) || text(webhookId) || bodyHash(rawBody)}`;

// =========================================================================
// WOOCOMMERCE
// =========================================================================
/**
 * WooCommerce checks a new webhook's address with an unsigned form post,
 * "webhook_id=<number>", and does not save the webhook as working unless it
 * is answered 200.
 */
export const isWoocommercePing = (rawBody: string, signatureHeader: string | null) =>
    !signatureHeader && /^webhook_id=\d+$/.test(rawBody.trim());

type WoocommerceTriggerSettings = {
    event?: unknown;
    // Only for order events: "processing", "completed"...
    orderStatus?: unknown;
};

/**
 * What a delivery means for one trigger node: null when the node is not
 * listening for it, otherwise the event the run is told about and the key
 * that keeps the same thing from starting a second run.
 */
export const matchWoocommerceDelivery = ({
    settings,
    topic,
    body,
    deliveryId,
    rawBody,
}: {
    settings: WoocommerceTriggerSettings;
    topic: string;
    body: unknown;
    deliveryId?: string | null;
    rawBody: string;
}): { event: string; dedupeKey: string } | null => {
    const event = text(settings.event) || ANY_EVENT;
    const payload = record(body);
    const isOrder = topic.startsWith("order.");
    const orderId = text(payload.id);
    const delivery = `${topic}:${text(deliveryId) || bodyHash(rawBody)}`;

    if (event === WOOCOMMERCE_PAID_EVENT) {
        const paid =
            (topic === "order.created" || topic === "order.updated") &&
            !!firstText(payload.date_paid_gmt, payload.date_paid);

        if (!paid || !orderId) return null;

        // A paid order is updated many more times: one run per order
        return { event, dedupeKey: `order:${orderId}:paid` };
    }

    if (event !== ANY_EVENT && event !== topic) return null;

    const wantedStatus = text(settings.orderStatus).toLowerCase().replace(/^wc-/, "");

    if (wantedStatus && isOrder) {
        if (text(payload.status).toLowerCase() !== wantedStatus || !orderId) return null;

        // WooCommerce sends "Order updated" several times for one change
        return { event: topic, dedupeKey: `order:${orderId}:status:${wantedStatus}` };
    }

    return { event: topic, dedupeKey: delivery };
};

const WOOCOMMERCE_RESOURCE_KEYS = new Set(["order", "product", "customer", "coupon"]);

export const buildWoocommerceTriggerData = ({
    event,
    topic,
    source,
    body,
}: {
    event: string;
    topic: string;
    source: string;
    body: unknown;
}) => {
    const payload = record(body);
    const billing = record(payload.billing);
    const shipping = record(payload.shipping);
    const resource = topic.split(".")[0] ?? "";

    return {
        event,
        topic,
        storeUrl: source,
        id: payload.id ?? null,
        email: firstText(billing.email, payload.email),
        phone: firstText(billing.phone, shipping.phone),
        customerName:
            [
                firstText(billing.first_name, payload.first_name),
                firstText(billing.last_name, payload.last_name),
            ]
                .filter(Boolean)
                .join(" "),
        // {{woocommerce.order.total}}, {{woocommerce.product.name}}...
        [WOOCOMMERCE_RESOURCE_KEYS.has(resource) ? resource : "data"]: body,
    };
};
