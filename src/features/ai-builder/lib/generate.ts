// "Build with AI": ask the model, check the answer, and ask once more with
// the problems when it does not pass. The model call is handed in, so this
// runs in tests without a provider.

import type { CatalogueNode } from "./catalogue";
import { SYSTEM_PROMPT, buildRetryPrompt, buildUserPrompt } from "./prompt";
import {
  checkGeneratedWorkflow,
  parseModelJson,
  type CheckedWorkflow,
} from "./workflow";

export type BuilderMessage = { role: "user" | "assistant"; content: string };

export type CallModel = (request: {
  system: string;
  messages: BuilderMessage[];
}) => Promise<string>;

// The first answer, and one more after being told what was wrong with it
export const MAX_ATTEMPTS = 2;

// A model that answers with a whole essay is not sent all of it back
const MAX_ECHOED_ANSWER = 30_000;

export type GenerateResult =
  | { ok: true; workflow: CheckedWorkflow; attempts: number }
  | { ok: false; errors: string[]; attempts: number };

export const generateWorkflow = async ({
  callModel,
  catalogue,
  lockedTypes,
  description,
  current,
  history,
}: {
  callModel: CallModel;
  catalogue: CatalogueNode[];
  lockedTypes?: Record<string, string>;
  description: string;
  current?: Pick<CheckedWorkflow, "nodes" | "connections">;
  history?: string[];
}): Promise<GenerateResult> => {
  const messages: BuilderMessage[] = [
    {
      role: "user",
      content: buildUserPrompt({ catalogue, description, current, history }),
    },
  ];

  let errors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const answer = await callModel({ system: SYSTEM_PROMPT, messages });
    const parsed = parseModelJson(answer);

    const checked = parsed.ok
      ? checkGeneratedWorkflow(parsed.value, catalogue, lockedTypes)
      : { workflow: null, errors: [parsed.error] };

    if (checked.workflow) {
      return { ok: true, workflow: checked.workflow, attempts: attempt };
    }

    errors = checked.errors;

    messages.push(
      { role: "assistant", content: answer.slice(0, MAX_ECHOED_ANSWER) },
      { role: "user", content: buildRetryPrompt(errors) }
    );
  }

  return { ok: false, errors, attempts: MAX_ATTEMPTS };
};
