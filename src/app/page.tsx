import { requireAuth } from "@/lib/auth-utils";
import { caller } from "@/trpc/server";
import { LogoutButton } from "./logout";

const Page = async () => {

  await requireAuth();

  const data = await caller.getUsers()

  return (
    <>
      <div className="text-black min-h-screen flex items-center">
        Protected server component
      <LogoutButton />
      </div>
    </>
  )
}

export default Page;