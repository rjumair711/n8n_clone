import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { createOpenAI, openai } from "@ai-sdk/openai";
import Handlebars from "handlebars"
import { generateText } from 'ai'
import { openaiChannel } from "@/inngest/channels/openai";
import { anthropicChannel } from "@/inngest/channels/anthropic";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";


Handlebars.registerHelper("json", (context) => {
    const jsonString = JSON.stringify(context, null, 2)
    const safeString = new Handlebars.SafeString(jsonString)

    return safeString;
})

type OpenAIData = {
    variableName?: string;
    credentialId?: string;
    model?: string;
    systemPrompt?: string;
    userPrompt?: string
}

export const OpenAIExecutor: NodeExecutor<OpenAIData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish
}) => {
    await publish(
        openaiChannel().status({
            nodeId,
            status: "loading"
        })
    )

    if (!data.variableName) {
        await publish(
            openaiChannel().status({
                nodeId,
                status: "error",
            })
        )
        throw new NonRetriableError("OpenAI node: Variable name is missing")
    }

    if (!data.credentialId) {
        await publish(
            anthropicChannel().status({
                nodeId,
                status: "error",
            })
        )
        throw new NonRetriableError("OpenAI node: Credential ID is required")
    }


    if (!data.userPrompt) {
        await publish(
            openaiChannel().status({
                nodeId,
                status: "error",
            })
        )
        throw new NonRetriableError("OpenAI node: User Prompt name is missing")
    }

    const systemPrompt = data.systemPrompt ? Handlebars.compile(data.systemPrompt)(context) :
        "You are a helpful assistant."

    const userPrompt = Handlebars.compile(data.userPrompt)(context)

    const credential = await step.run("get-credential", () => {
        return prisma.credential.findUnique({
            where: {
                id: data.credentialId,
                userId,
            }
        })
    })

    if (!credential) {
        await publish(
            openaiChannel().status({
                nodeId,
                status: "error",
            })
        )
        throw new NonRetriableError("OpenAI node: Credential not found")
    }


    const openai = createOpenAI({
        apiKey: decrypt(credential.value),
    })

    try {
        const { steps } = await step.ai.wrap(
            "openai-generate-text",
            generateText,
            {
                model: openai("gpt-4o-mini"),
                system: systemPrompt,
                prompt: userPrompt,
                experimental_telemetry: {
                    isEnabled: true,
                    recordInputs: true,
                    recordOutputs: true
                }
            },
        )

        const text = steps[0].content[0].type === "text"
            ? steps[0].content[0].text : "";

        await publish(
            openaiChannel().status({
                nodeId,
                status: "success"
            })
        )

        return {
            ...context,
            [data.variableName]: {
                text,
            }
        }

    } catch (error) {
        await publish(
            openaiChannel().status({
                nodeId,
                status: "error"
            })
        )
        throw error

    }
}