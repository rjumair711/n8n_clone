import { setVariableChannel } from "@/inngest/channels/set-variable";
import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest"; // Ensure proper error handling
import ky from "ky"; // For making HTTP requests if needed (this can be omitted if not necessary for your use case)

type SetVariableData = {
  variableName: string;
  variableValue: string;
  webhookUrl?: string;  // Optional: Provide a URL where the response should be sent (if needed)
  variableNameForResponse?: string;  // Optional: For saving the response message to a variable
};

export const setVariableExecutor: NodeExecutor<SetVariableData> = async ({
  data,
  context,
  step,
  publish
}) => {
  const { variableName, variableValue, webhookUrl, variableNameForResponse } = data;

  const nodeId = (step as any).id; // Ensure you're using the correct `nodeId` (casting `step` to `any` to bypass TypeScript error)

  // Publish the "loading" status to the Set Variable channel
  await publish(
    setVariableChannel().status({
      nodeId: nodeId,
      status: "loading",
      message: "Setting variable..."  // Include a message
    })
  );

  // Validate required fields
  if (!variableName || !variableValue) {
    await publish(
      setVariableChannel().status({
        nodeId: nodeId,
        status: "error",
        message: "Variable name or value is missing"  // Provide an error message
      })
    );
    throw new NonRetriableError("Set Variable node requires a variable name and variable value");
  }

  // Optionally handle the case where you need to send a response to a webhook (if webhookUrl is provided)
  if (webhookUrl) {
    try {
      await ky.post(webhookUrl, {
        json: {
          variableName,
          variableValue,
        },
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // Handle error safely, ensuring that we access properties only when available
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; // Safely access the error message

      // Publish error status and throw the error
      await publish(
        setVariableChannel().status({
          nodeId: nodeId,
          status: "error",
          message: `Error sending response: ${errorMessage}`  // Include error message
        })
      );
      throw error;  // Rethrow the error
    }
  }

  // Update context with the new variable
  context = {
    ...context,
    [variableName]: variableValue,  // Add the variable to the context
  };

  // If variableNameForResponse is provided, store the response message in the context
  if (variableNameForResponse) {
    context = {
      ...context,
      [variableNameForResponse]: variableValue,
    };
  }

  // Publish success status
  await publish(
    setVariableChannel().status({
      nodeId: nodeId,
      status: "success",
      message: `Variable ${variableName} set successfully to ${variableValue}`,  // Success message
    })
  );

  // Return updated context with the new variable
  return context;
};