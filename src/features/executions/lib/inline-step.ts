import type { StepTools } from "../types";

/**
 * Step tools for code that already runs inside a step (an AI Agent's tool
 * call, an approval notification): Inngest steps cannot be nested, so
 * `run` simply runs, and the tools that pause or send events do nothing.
 */
export const createInlineStep = (step: StepTools): StepTools =>
  ({
    ...step,
    run: async (_id: unknown, fn: () => unknown) => fn(),
    sleep: async () => {},
    sleepUntil: async () => {},
    sendEvent: async () => ({ ids: [] }),
    ai: {
      ...step.ai,
      wrap: async (_id: unknown, fn: (...args: any[]) => unknown, ...args: any[]) =>
        fn(...args),
    },
  }) as unknown as StepTools;
