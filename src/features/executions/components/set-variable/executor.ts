import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import ky from "ky";

type SetVariableData = {
  variableName: string;
  variableValue: string;
  webhookUrl?: string;
  variableNameForResponse?: string;
};

export const setVariableExecutor: NodeExecutor<
  SetVariableData
> = async ({
  data,
  context,
  step,
}) => {

  const {
    variableName,
    variableValue,
    webhookUrl,
    variableNameForResponse,
  } = data;

  // Validation
  if (!variableName || !variableValue) {
    throw new NonRetriableError(
      "Set Variable node requires variableName and variableValue"
    );
  }

  try {

    // Optional webhook call
    if (webhookUrl) {

      await step.run(
        "send-variable-webhook",
        async () => {

          await ky.post(webhookUrl, {
            json: {
              variableName,
              variableValue,
            },

            headers: {
              "Content-Type":
                "application/json",
            },
          });
        }
      );
    }

    // Update workflow context
    let updatedContext = {
      ...context,

      [variableName]:
        variableValue,
    };

    // Optional mirrored variable
    if (variableNameForResponse) {

      updatedContext = {
        ...updatedContext,

        [variableNameForResponse]:
          variableValue,
      };
    }

    return updatedContext;

  } catch (error: any) {

    throw new NonRetriableError(
      `Set Variable node failed: ${error.message}`
    );
  }
};