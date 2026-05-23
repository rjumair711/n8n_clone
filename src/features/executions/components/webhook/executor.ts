import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import ky from "ky";

type WebhookResponseData = {
  responseMessage: string;
  responseStatus: "success" | "error";
  webhookUrl?: string;
  variableName?: string;
};

export const webhookResponseExecutor: NodeExecutor<
  WebhookResponseData
> = async ({
  data,
  context,
  step,
}) => {

  const {
    responseMessage,
    responseStatus,
    webhookUrl,
    variableName,
  } = data;

  // Validation
  if (!responseMessage || !responseStatus) {
    throw new NonRetriableError(
      "Webhook Response node requires responseMessage and responseStatus"
    );
  }

  if (!webhookUrl) {
    throw new NonRetriableError(
      "Webhook Response node requires webhookUrl"
    );
  }

  // Prepare response body
  const responseBody = {
    status: responseStatus,
    message: responseMessage,
    context,
  };

  try {

    // Send webhook request safely
    const result = await step.run(
      "send-webhook-response",
      async () => {

        const response = await ky.post(
          webhookUrl,
          {
            json: responseBody,

            headers: {
              "Content-Type":
                "application/json",
            },

            throwHttpErrors: false,
          }
        );

        const contentType =
          response.headers.get(
            "content-type"
          );

        let parsedResponse: any;

        if (
          contentType &&
          contentType.includes(
            "application/json"
          )
        ) {
          parsedResponse =
            await response.json();
        } else {
          parsedResponse = {
            status: response.status,
            text: await response.text(),
          };
        }

        return {
          ...context,

          ...(variableName
            ? {
                [variableName]: {
                  webhookResponse:
                    parsedResponse,
                },
              }
            : {}),
        };
      }
    );

    return result;

  } catch (error: any) {

    throw new NonRetriableError(
      `Webhook Response node failed: ${error.message}`
    );
  }
};