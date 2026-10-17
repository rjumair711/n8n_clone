import { redirect } from "next/navigation";

// API Keys moved into Settings; old links and bookmarks still work
const Page = () => {
  redirect("/settings/api-keys");
};

export default Page;
