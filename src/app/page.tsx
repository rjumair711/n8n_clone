import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import Client from "./Client";
import { getQueryClient, trpc } from "@/trpc/server";
import { Suspense } from "react";

const Page = async () => {
  const queryClient = getQueryClient()

  void queryClient.prefetchQuery(trpc.getUsers.queryOptions())

  return (
    <>
      <div className="text-black">
        <HydrationBoundary state={dehydrate(queryClient)}>
          <Suspense fallback={<p>Loading...</p>}>
            <Client />
          </Suspense>
        </HydrationBoundary>
      </div>
    </>
  )
}

export default Page;