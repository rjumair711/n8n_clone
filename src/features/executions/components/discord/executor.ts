import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";
import { decode } from "html-entities";
import ky from "ky";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(
    context,
    null,
    2
  );

  return new Handlebars.SafeString(
    jsonString
  );
});

type DiscordData = {
  variableName?: string;
  webhookUrl?: string;
  content?: string;
  username?: string;
};

export const discordExecutor: NodeExecutor<
  DiscordData
> = async ({
  data,
  context,
  step,
}) => {

  // Validation
  if (!data.content) {
    throw new NonRetriableError(
      "Discord node: Message content is required"
    );
  }

  if (!data.webhookUrl) {
    throw new NonRetriableError(
      "Discord node: Webhook URL is required"
    );
  }

  if (!data.variableName) {
    throw new NonRetriableError(
      "Discord node: Variable name is missing"
    );
  }

  // Compile content
  const rawContent =
    Handlebars.compile(
      data.content
    )(context);

  const content = decode(rawContent);

  // Optional username
  const username = data.username
    ? decode(
        Handlebars.compile(
          data.username
        )(context)
      )
    : undefined;

  try {

    const result = await step.run(
      "discord-webhook",
      async () => {

        await ky.post(
          data.webhookUrl!,
          {
            json: {
              content:
                content.slice(0, 2000),

              username,
            },
          }
        );

        return {
          ...context,

          [data.variableName!]: {
            messageContent:
              content.slice(0, 2000),
          },
        };
      }
    );

    return result;

  } catch (error: any) {

    throw new NonRetriableError(
      `Discord node failed: ${error.message}`
    );
  }
};