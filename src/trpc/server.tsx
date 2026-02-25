import 'server-only'; // <-- ensure this file cannot be imported from the client
import { createTRPCOptionsProxy, TRPCQueryBaseOptions } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { createTRPCContext } from './init';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';
import { dehydrate, FetchInfiniteQueryOptions, FetchQueryOptions, HydrationBoundary } from '@tanstack/react-query';
// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);
export const trpc = createTRPCOptionsProxy({
  ctx: createTRPCContext,
  router: appRouter,
  queryClient: getQueryClient,
});

export const caller = appRouter.createCaller(createTRPCContext);

// Use a union type to allow both standard and infinite query options

export function prefetch(
  queryOptions: FetchQueryOptions<any, any, any, any> | FetchInfiniteQueryOptions<any, any, any, any, any>
) {
  const queryClient = getQueryClient();

  // tRPC v11 embeds the type in the queryKey to help distinguish these
  if ((queryOptions.queryKey[1] as any)?.type === 'infinite') {
    void queryClient.prefetchInfiniteQuery(queryOptions as any);
  } else {
    void queryClient.prefetchQuery(queryOptions as any);
  }
}

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  )
}