import type { NodeExecutor } from "@/features/executions/types";
import { renderEscapedTemplate } from "@/features/executions/lib/templates";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";
import { decode } from "html-entities";
import ky from "ky";
import { assertPublicUrl } from "@/lib/ssrf";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);

  return safeString;
});

type SlackData = {
  variableName?: string;
  webhookUrl?: string;
  content?: string;
};

export const slackExecutor: NodeExecutor<SlackData> = async ({
  data,
  nodeId,
  context,
  step,
}) => {

  // Validation
  if (!data.content) {
    throw new NonRetriableError(
      "Slack node: Message content is required"
    );
  }

  if (!data.webhookUrl) {
    throw new NonRetriableError(
      "Slack node: Webhook URL is required"
    );
  }

  if (!data.variableName) {
    throw new NonRetriableError(
      "Slack node: Variable name is missing"
    );
  }

  // Parse handlebars variables
  const rawContent = renderEscapedTemplate(data.content, context);

  const content = decode(rawContent);

  try {

    const result = await step.run(
      "slack-webhook",
      async () => {

        // The URL is typed in by the user: never call into a private network
        await assertPublicUrl(data.webhookUrl!);

        await ky.post(data.webhookUrl!, {
          redirect: "error",
          json: {
            content,
          },
        });

        return {
          ...context,
          [data.variableName!]: {
            messageContent: content.slice(0, 2000),
          },
        };
      }
    );

    return result;

  } catch (error: any) {

    throw new NonRetriableError(
      `Slack node failed: ${error.message}`
    );
  }
};