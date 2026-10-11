import type { Metadata } from "next";
import { FormUnavailable, HostedForm } from "@/features/forms/components/hosted-form";
import { loadWaitingForm } from "@/features/forms/server/waiting";
import { verifyFormToken } from "@/lib/execution-wait";

// The form a running execution waits for ({{execution.formUrl}}): a Wait
// node set to "On Form Submitted", or a Form node. The token in the
// address belongs to that one execution.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false },
  // The address is a secret: it is not passed on to where a link leads
  referrer: "no-referrer",
};

const Page = async ({
  params,
}: {
  params: Promise<{ executionId: string; token: string }>;
}) => {
  const { executionId, token } = await params;

  const waiting = verifyFormToken(executionId, token)
    ? await loadWaitingForm(executionId)
    : null;

  if (!waiting) {
    return <FormUnavailable message="This form is not available." />;
  }

  if (waiting.state.state === "done" || waiting.state.state === "failed") {
    return (
      <FormUnavailable message="This form was already submitted, or it is no longer open." />
    );
  }

  return (
    <HostedForm
      // Not there yet: the page waits for it
      page={waiting.state.state === "page" ? waiting.state.page : null}
      submitUrl={`/api/forms/wait/${encodeURIComponent(executionId)}/${token}`}
      continues
    />
  );
};

export default Page;
