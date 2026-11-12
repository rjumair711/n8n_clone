// What the Slack and Discord nodes post. No server-only imports, so the
// tests run it.
//
// Both nodes render their message with HTML-escaped values (see
// renderEscapedTemplate): & < > " ' ` = in a value arrive as entities, while
// the text typed in the template is kept as it is.

import { decode } from "html-entities";

// Slack Workflow Builder webhooks take the variables their workflow defines
// (this node sends one called "content"); incoming webhooks
// (hooks.slack.com/services/...) take "text"
export const isSlackWorkflowWebhook = (url: string) =>
  /^https:\/\/hooks\.slack\.com\/(?:triggers|workflows)\//i.test(url.trim());

export const isSlackIncomingWebhook = (url: string) =>
  /^https:\/\/hooks\.slack\.com\/services\//i.test(url.trim());

/**
 * Slack's own message format escapes &, < and > (so <!channel>, <@U123> and
 * <https://x|link> typed in the template still work), and nothing else. A
 * value keeps those three as entities, so a form answer like "<!channel>"
 * is shown as text instead of notifying everyone; the other entities are
 * turned back into their characters.
 */
export const toSlackText = (escaped: string) =>
  escaped.replace(/&(?:quot|#x27|#39|#x60|#x3D);/g, (entity) => decode(entity));

export const buildSlackPayload = (
  webhookUrl: string,
  escaped: string
): { text?: string; content?: string } => {
  if (isSlackWorkflowWebhook(webhookUrl)) return { content: decode(escaped) };
  if (isSlackIncomingWebhook(webhookUrl)) return { text: toSlackText(escaped) };

  // Another service with a Slack-compatible webhook: both names, as text
  const text = decode(escaped);
  return { text, content: text };
};

// Slack's escaping, for text that is all data (nothing typed by an author)
export const escapeSlackText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The same choice of field for a message made entirely of data: an
 * approval request (with its links) or a chat handoff (with what the
 * visitor wrote). In an incoming webhook nothing in it can mention anyone;
 * links are still turned into links by Slack.
 */
export const buildSlackTextPayload = (
  webhookUrl: string,
  text: string
): { text?: string; content?: string } => {
  if (isSlackWorkflowWebhook(webhookUrl)) return { content: text };
  if (isSlackIncomingWebhook(webhookUrl)) return { text: escapeSlackText(text) };

  // Discord and Slack-compatible webhooks read "content", at most 2000 characters
  return { text, content: text.slice(0, 2000) };
};

/**
 * Discord's allowed_mentions: only the kinds of mention typed in the
 * template itself (@everyone or @here, <@user>, <@&role>) can notify
 * anyone. A value cannot add one: "@everyone" in a form answer is posted as
 * text and pings no one.
 */
export const discordAllowedMentions = (template: string | undefined) => {
  const typed = (template ?? "").replace(/\{\{[\s\S]*?\}\}/g, "");
  const parse: ("everyone" | "users" | "roles")[] = [];

  if (/@(?:everyone|here)\b/.test(typed)) parse.push("everyone");
  if (/<@!?\d+>/.test(typed)) parse.push("users");
  if (/<@&\d+>/.test(typed)) parse.push("roles");

  return { parse };
};
