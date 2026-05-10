import { channel, topic } from "@inngest/realtime";

// Define the Set Variable channel name
export const SET_VARIABLE_CHANNEL_NAME = "set-variable-execution"; 

// Create the Set Variable channel with status and response topics
export const setVariableChannel = channel(SET_VARIABLE_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";  // The status of the Set Variable operation
      message: string;  // The message that provides additional details
    }>()
  )
  .addTopic(
    topic("response").type<{
      nodeId: string;
      variableName: string;  // Name of the variable
      variableValue: string;  // Value of the variable
    }>()
  );