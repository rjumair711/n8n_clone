import { NodeExecutor } from "../../types";
import { renderEscapedTemplate } from "@/features/executions/lib/templates";
import { NonRetriableError } from "inngest";
import { google } from "googleapis";
import Handlebars from "handlebars";
import prisma from "@/lib/db";
import { getGoogleAuth } from "@/lib/google-oauth";
import { GoogleCalendarNodeData } from "./node"; // Import your type from node.tsx

export const googleCalendarExecutor: NodeExecutor<GoogleCalendarNodeData> = async ({
    data,
    userId,
    context,
    step,
}) => {
    const operation = data.operation || "create";

    // 1. Base Validation (Required for all operations)
    if (!data.credentialId || !data.variableName) {
        throw new NonRetriableError("Google Calendar node: Missing Credential ID or Variable Name");
    }

    // 2. Operation-Specific Validation
    if (operation === "create") {
        if (!data.calendarId || !data.summary || !data.startTime || !data.endTime) {
            throw new NonRetriableError("Google Calendar node (Create): Missing required fields (Calendar ID, Summary, Start Time, End Time)");
        }
    } else if (operation === "update" || operation === "delete") {
        if (!data.calendarId || !data.eventId) {
            throw new NonRetriableError(`Google Calendar node (${operation}): Missing Calendar ID or Event ID`);
        }
    }

    // Fetch credential
    const credential = await step.run("get-calendar-credential", async () => {
        return prisma.credential.findUnique({
            where: { id: data.credentialId, userId },
        });
    });

    if (!credential) {
        throw new NonRetriableError("Google Calendar node: Credential not found");
    }


    // Resolve dynamic variables via Handlebars safely
    const compile = (template?: string) => {
        if (!template) return "";
        return renderEscapedTemplate(template, context);
    };

    const resolvedCalendarId = compile(data.calendarId) || "primary";
    const resolvedEventId = compile(data.eventId);
    const resolvedSummary = compile(data.summary);
    const resolvedDescription = compile(data.description);
    const resolvedStartTime = compile(data.startTime);
    const resolvedEndTime = compile(data.endTime);

    try {
        // Run the appropriate Google API step based on the operation selection
        const result = await step.run(`${operation}-calendar-event`, async () => {
            // A Google account (OAuth) or a service account
            const auth = getGoogleAuth("Google Calendar", credential, [
                "https://www.googleapis.com/auth/calendar.events",
            ]);

            const calendar = google.calendar({ version: "v3", auth });

            switch (operation) {
                case "create": {
                    const response = await calendar.events.insert({
                        calendarId: resolvedCalendarId,
                        requestBody: {
                            summary: resolvedSummary,
                            description: resolvedDescription,
                            start: { dateTime: new Date(resolvedStartTime).toISOString() },
                            end: { dateTime: new Date(resolvedEndTime).toISOString() },
                        },
                    });
                    return {
                        eventId: response.data.id,
                        status: response.data.status,
                        htmlLink: response.data.htmlLink,
                    };
                }

                case "update": {
                    const response = await calendar.events.patch({
                        calendarId: resolvedCalendarId,
                        eventId: resolvedEventId,
                        requestBody: {
                            ...(data.summary && { summary: resolvedSummary }),
                            ...(data.description && { description: resolvedDescription }),
                            ...(data.startTime && { start: { dateTime: new Date(resolvedStartTime).toISOString() } }),
                            ...(data.endTime && { end: { dateTime: new Date(resolvedEndTime).toISOString() } }),
                        },
                    });
                    return {
                        eventId: response.data.id,
                        status: response.data.status,
                        htmlLink: response.data.htmlLink,
                    };
                }

                case "delete": {
                    await calendar.events.delete({
                        calendarId: resolvedCalendarId,
                        eventId: resolvedEventId,
                    });
                    return {
                        eventId: resolvedEventId,
                        status: "deleted",
                    };
                }

                default:
                    throw new NonRetriableError(`Unsupported operation: ${operation}`);
            }
        });

        // Merge the output object back into the workflow context execution chain
        return {
            ...context,
            [data.variableName]: result,
        };
    } catch (error: any) {
        throw new NonRetriableError(`Google Calendar node failed: ${error.message}`);
    }
};