import { EmailSendNode } from './../features/executions/components/email/node';
import { InitialNode } from "@/components/initial-node";
import { AnthropicNode } from "@/features/executions/components/anthropic/node";
import { CodeNode } from '@/features/executions/components/code/node';
import { DelayNode } from "@/features/executions/components/delay/node";
import { DiscordNode } from "@/features/executions/components/discord/node";
import { FilterNode } from "@/features/executions/components/filter/node";
import { GeminiNode } from "@/features/executions/components/gemini/node";
import { GoogleSheetsNode } from '@/features/executions/components/googleSheet/node';
import { HttpRequestNode } from "@/features/executions/components/http-request/node";
import { OpenAINode } from "@/features/executions/components/openai/node";
import { SetVariableNode } from "@/features/executions/components/set-variable/node";
import { SlackNode } from "@/features/executions/components/slack/node";
import { WebhookResponseNode } from "@/features/executions/components/webhook/node";
import { GoogleFormTrigger } from "@/features/triggers/components/google-form-trigger/node";
import { ManualTriggerNode } from "@/features/triggers/components/manual-trigger/node";
import { ScheduleNode } from '@/features/triggers/components/schedule-trigger/node';
import { StripeTriggerNode } from "@/features/triggers/components/stripe-trigger/node";
import { NodeType } from "@prisma/client";
import { AIAgentNode } from '../features/editor/components/agent/node';
import { BufferMemoryNode } from '@/features/editor/components/memory/node';
import { NodeTypes } from '@xyflow/react';
import { GoogleCalendarNode } from '@/features/executions/components/googleCalender/node';
import { NotionNode } from '@/features/executions/components/notion/node';
import { TelegramNode } from '@/features/executions/components/telegram/node';
import { DateTimeNode } from '@/features/executions/components/daytime/node';
import { TextFormatterNode } from '../features/executions/components/textFormatter/node';
import { CalculatorNode } from '../features/executions/components/calculator/node';

export const nodeComponents: NodeTypes = {
    [NodeType.INITIAL]: InitialNode,
    [NodeType.HTTP_REQUEST]: HttpRequestNode,
    [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
    [NodeType.GOOGLE_FORM_TRIGGER]: GoogleFormTrigger,
    [NodeType.STRIPE_TRIGGER]: StripeTriggerNode,
    [NodeType.GEMINI]: GeminiNode,
    [NodeType.OPENAI]: OpenAINode,
    [NodeType.ANTHROPIC]: AnthropicNode,
    [NodeType.DISCORD]: DiscordNode,
    [NodeType.SLACK]: SlackNode,
    [NodeType.FILTER]: FilterNode,
    [NodeType.SET_VARIABLE]: SetVariableNode,
    [NodeType.DELAY]: DelayNode,
    [NodeType.WEBHOOK_RESPONSE]: WebhookResponseNode,
    [NodeType.EMAIL_SEND]: EmailSendNode,
    [NodeType.GOOGLE_SHEETS]: GoogleSheetsNode,
    [NodeType.SCHEDULE_TRIGGER]: ScheduleNode,
    [NodeType.CODE]: CodeNode,
    [NodeType.AI_AGENT]: AIAgentNode,
    [NodeType.BUFFER_MEMORY]: BufferMemoryNode,
    [NodeType.GOOGLE_CALENDAR]: GoogleCalendarNode,
    [NodeType.NOTION]: NotionNode,
    [NodeType.TELEGRAM]: TelegramNode,
    [NodeType.DATE_TIME]: DateTimeNode,
    [NodeType.TEXT_FORMATTER]: TextFormatterNode,
    [NodeType.CALCULATOR]: CalculatorNode,
};

export type RegisteredNodeType = keyof typeof nodeComponents;