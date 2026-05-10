import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { filterChannel } from "@/inngest/channels/filter";

// Define Filter Token Type
export type FilterToken = Realtime.Token<
  typeof filterChannel,  // Filter channel type
  ["status", "response"]  // Topics for filter channel
>;

// Fetch Filter Realtime Token Function
export async function fetchFilterRealtimeToken(): Promise<FilterToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: filterChannel(),  // The Filter channel you created
    topics: ["status", "response"],  // Topics you want to subscribe to
  });
  return token;
}