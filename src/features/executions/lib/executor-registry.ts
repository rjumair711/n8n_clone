import { stripeTriggerExecutor } from './../../triggers/components/stripe-trigger/executor';
import { NodeType } from "@prisma/client";
import { NodeExecutor } from "../types";
import { manualTriggerExecutor } from "@/features/triggers/components/manual-trigger/executor";
import { httpRequestExecutor } from "../components/http-request/executor";
import { googleFormTriggerExecutor } from "@/features/triggers/components/google-form-trigger/executor";
import { geminiExecutor } from '../components/gemini/executor';
import { OpenAIExecutor } from '../components/openai/executor';
import { AnthropicExecutor } from '../components/anthropic/executor';
import { discordExecutor } from '../components/discord/executor';
import { slackExecutor } from '../components/slack/executor';
import { filterExecutor } from '../components/filter/executor';
import { setVariableExecutor } from '../components/set-variable/executor';
import { delayExecutor } from '../components/delay/executor';
import { webhookResponseExecutor } from '../components/webhook/executor';
import { emailExecutor } from '../components/email/executor';
import { googleSheetsExecutor } from '../components/googleSheet/executor';
import { ScheduleExecutor } from '@/features/triggers/components/schedule-trigger/executor';
import { codeNodeExecutor } from '../components/code/executor';
import { aiAgentExecutor } from '../../editor/components/agent/executor';
import { bufferMemoryExecutor } from '@/features/editor/components/memory/executor';
import { googleCalendarExecutor } from '../components/googleCalender/executor';
import { notionExecutor } from '../components/notion/executor';
import { telegramExecutor } from '../components/telegram/executor';
import { dateTimeExecutor } from '../components/daytime/executor';
import { textFormatterExecutor } from '../components/textFormatter/executor';

export const executorRegistry: Record<NodeType, NodeExecutor<any>> = {
  [NodeType.MANUAL_TRIGGER]: manualTriggerExecutor,
  [NodeType.INITIAL]: manualTriggerExecutor,
  [NodeType.HTTP_REQUEST]: httpRequestExecutor,
  [NodeType.GOOGLE_FORM_TRIGGER]: googleFormTriggerExecutor,
  [NodeType.STRIPE_TRIGGER]: stripeTriggerExecutor,
  [NodeType.GEMINI]: geminiExecutor,
  [NodeType.ANTHROPIC]: AnthropicExecutor,
  [NodeType.OPENAI]: OpenAIExecutor,
  [NodeType.DISCORD]: discordExecutor,
  [NodeType.SLACK]: slackExecutor,
  [NodeType.FILTER]: filterExecutor,
  [NodeType.SET_VARIABLE]: setVariableExecutor,
  [NodeType.DELAY]: delayExecutor,
  [NodeType.WEBHOOK_RESPONSE]: webhookResponseExecutor,
  [NodeType.GOOGLE_SHEETS]: googleSheetsExecutor,
  [NodeType.EMAIL_SEND]: emailExecutor,
  [NodeType.SCHEDULE_TRIGGER]: ScheduleExecutor,
  [NodeType.CODE]: codeNodeExecutor,
  [NodeType.AI_AGENT]: aiAgentExecutor,
  [NodeType.BUFFER_MEMORY]: bufferMemoryExecutor,
  [NodeType.GOOGLE_CALENDAR]: googleCalendarExecutor,
  [NodeType.NOTION]: notionExecutor,
  [NodeType.TELEGRAM]: telegramExecutor,
  [NodeType.DATE_TIME]: dateTimeExecutor,
  [NodeType.TEXT_FORMATTER]: textFormatterExecutor,
}

export const getExecutor = (type: NodeType): NodeExecutor<any> => {
  const executor = executorRegistry[type];
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }
  return executor;
};