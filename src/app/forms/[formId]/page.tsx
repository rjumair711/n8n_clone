import type { Metadata } from "next";
import { FormUnavailable, HostedForm } from "@/features/forms/components/hosted-form";
import { loadTriggerForm } from "@/features/forms/server/trigger";

// A Form Trigger's public page. No sign-in: anyone with the address can
// fill it in while the workflow is active.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

const Page = async ({ params }: { params: Promise<{ formId: string }> }) => {
  const { formId } = await params;
  const hosted = await loadTriggerForm(formId);

  if (!hosted) {
    return (
      <FormUnavailable message="This form is not available. It may have been switched off." />
    );
  }

  return (
    <HostedForm
      page={hosted.page}
      submitUrl={`/api/forms/${encodeURIComponent(formId)}`}
      captchaSiteKey={hosted.captcha?.siteKey}
    />
  );
};

export default Page;
