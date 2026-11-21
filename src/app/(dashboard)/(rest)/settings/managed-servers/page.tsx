import { redirect } from "next/navigation";

// Managed servers moved to the admin area
const Page = () => redirect("/admin/servers");

export default Page;
