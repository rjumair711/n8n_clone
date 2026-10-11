// The events the Shopify and WooCommerce triggers can listen for. Shared by
// the node dialogs (in the browser) and the webhook routes, so nothing here
// may import server code.

export const ANY_EVENT = "any";

// The value is the webhook topic Shopify sends in X-Shopify-Topic
export const SHOPIFY_EVENTS = [
  { value: "orders/create", label: "Order created" },
  { value: "orders/paid", label: "Order paid" },
  { value: "orders/updated", label: "Order updated" },
  { value: "orders/fulfilled", label: "Order fulfilled" },
  { value: "orders/cancelled", label: "Order cancelled" },
  { value: "products/create", label: "Product created" },
  { value: "products/update", label: "Product updated" },
  { value: "customers/create", label: "Customer created" },
  { value: "checkouts/create", label: "Checkout created" },
  { value: "checkouts/update", label: "Checkout updated" },
  { value: ANY_EVENT, label: "Any event sent to the URL" },
];

// "order.paid" is not a WooCommerce topic: it is the first "Order created"
// or "Order updated" delivery of an order that has a payment date
export const WOOCOMMERCE_PAID_EVENT = "order.paid";

// The other values are the topics WooCommerce sends in X-WC-Webhook-Topic
export const WOOCOMMERCE_EVENTS = [
  { value: "order.created", label: "Order created" },
  { value: WOOCOMMERCE_PAID_EVENT, label: "Order paid" },
  { value: "order.updated", label: "Order updated" },
  { value: "product.created", label: "Product created" },
  { value: "product.updated", label: "Product updated" },
  { value: "customer.created", label: "Customer created" },
  { value: ANY_EVENT, label: "Any event sent to the URL" },
];

export const eventLabel = (
  events: { value: string; label: string }[],
  value?: string
) => events.find((event) => event.value === value)?.label;
