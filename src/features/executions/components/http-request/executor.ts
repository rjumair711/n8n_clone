import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky, {
  type Options as KyOptions,
} from "ky";
import Handlebars from "handlebars";

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

type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";

  body?: string;
};

export const httpRequestExecutor: NodeExecutor<
  HttpRequestData
> = async ({
  data,
  context,
  step,
}) => {

  // Validation
  if (!data.endpoint) {
    throw new NonRetriableError(
      "HTTP Request node: No endpoint configured"
    );
  }

  if (!data.variableName) {
    throw new NonRetriableError(
      "HTTP Request node: Variable name not configured"
    );
  }

  if (!data.method) {
    throw new NonRetriableError(
      "HTTP Request node: Method not configured"
    );
  }

  try {

    const result = await step.run(
      "http-request",
      async () => {

        // Resolve variables
        const endpoint =
          Handlebars.compile(
            data.endpoint!
          )(context);

        const method = data.method!;

        const options: KyOptions = {
          method,
        };

        // Handle request body
        if (
          ["POST", "PUT", "PATCH"].includes(
            method
          )
        ) {

          const resolvedBody =
            Handlebars.compile(
              data.body || "{}"
            )(context);

          // Validate JSON
          JSON.parse(resolvedBody);

          options.body = resolvedBody;

          options.headers = {
            "Content-Type":
              "application/json",
          };
        }

        // Make request
        const response = await ky(
          endpoint,
          options
        );

        // Parse response
        const contentType =
          response.headers.get(
            "content-type"
          );

        const responseData =
          contentType?.includes(
            "application/json"
          )
            ? await response.json()
            : await response.text();

        const responsePayload = {
          httpResponse: {
            status: response.status,
            statusText:
              response.statusText,
            data: responseData,
          },
        };

        return {
          ...context,

          [data.variableName!]:
            responsePayload,
        };
      }
    );

    return result;

  } catch (error: any) {

    throw new NonRetriableError(
      `HTTP Request node failed: ${error.message}`
    );
  }
};