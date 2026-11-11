import "server-only";

import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import {
  gotoGuarded,
  listPageElements,
  openBrowserPage,
  resolveBrowserEndpoint,
  runBrowserSteps,
  type BrowserSession,
} from "@/lib/browser";
import {
  BrowserStepError,
  parseBrowserSteps,
  resolveBrowserTimeout,
} from "@/lib/browser-steps";
import { saveWorkflowFile } from "@/lib/workflow-files";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import {
  extractReadableContent,
  limitText,
  resolveMaxCharacters,
} from "../../lib/readability";

// The Browser node: opens a page in a real Chrome, so pages that build their
// content with JavaScript, need a click or a form, or should be seen as a
// picture, can be used in a workflow. See src/lib/browser.ts for where the
// browser comes from and how its requests are guarded.

export const BROWSER_OPERATIONS = [
  { value: "content", label: "Get Page Content" },
  { value: "screenshot", label: "Take Screenshot" },
  { value: "steps", label: "Run Steps (click, type, submit)" },
] as const;

export const BROWSER_DEFAULT_CHARACTERS = 8000;
export const BROWSER_MAX_CHARACTERS = 100_000;

type BrowserData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  url?: string;
  steps?: string;
  waitForSelector?: string;
  format?: string;
  maxCharacters?: string;
  fullPage?: string;
  screenshotAtEnd?: string;
  listElements?: string;
  timeout?: string;
  [key: string]: string | undefined;
};

const label = "Browser";

// The whole Steps field is one {{...}}, e.g. {{$fromAI "steps"}}: an AI
// Agent writes the list
export const isWholeTemplate = (text: string) => /^\s*\{\{[\s\S]*\}\}\s*$/.test(text);

/**
 * The steps of Run Steps. Written in the node: a JSON list whose values may
 * hold {{...}}, filled in after the JSON is read. Written by an AI Agent
 * (the whole field is {{$fromAI ...}}): the model's JSON, read as it is.
 * Its values are never rendered again, so text the model copied from a
 * page cannot run {{...}} expressions.
 */
export const readSteps = (field: string, render: (text: string) => string) =>
  isWholeTemplate(field) ? parseBrowserSteps(render(field)) : parseBrowserSteps(field, render);

const readPage = async (
  session: BrowserSession,
  { format, maxCharacters }: { format: "markdown" | "text"; maxCharacters: number }
) => {
  const html = await session.page.content();
  const finalUrl = session.page.url();
  const page = extractReadableContent(html, { format, baseUrl: finalUrl });
  // Cut here: the whole page is never kept in the run
  const limited = limitText(page.content, maxCharacters);

  return {
    url: finalUrl.slice(0, 2000),
    title: page.title.slice(0, 300),
    description: page.description.slice(0, 1000),
    content: limited.text,
    truncated: limited.truncated,
    length: page.content.length,
  };
};

const screenshot = async (
  session: BrowserSession,
  { fullPage, userId, executionId }: { fullPage: boolean; userId: string; executionId?: string }
) => {
  const image = await session.page.screenshot({ type: "png", fullPage });
  const host = (() => {
    try {
      return new URL(session.page.url()).hostname;
    } catch {
      return "page";
    }
  })();

  // Stored like every other workflow file: same size limit and quota,
  // removed after the retention period
  return saveWorkflowFile({
    label,
    userId,
    executionId,
    fileName: `${host || "page"}-screenshot.png`,
    mimeType: "image/png",
    data: image,
  });
};

export const browserExecutor: NodeExecutor<BrowserData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
}) => {
  const variableName = data.variableName?.trim() || "browser";
  const operation = data.operation || "content";

  if (!BROWSER_OPERATIONS.some((entry) => entry.value === operation)) {
    throw new NonRetriableError(`Browser node: Unsupported operation "${operation}"`);
  }

  const url = renderTemplate(data.url, context).trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new NonRetriableError("Browser node: URL must start with http:// or https://");
  }

  const render = (text: string) => renderTemplate(text, context);
  let steps: ReturnType<typeof parseBrowserSteps> = [];
  if (operation === "steps") {
    try {
      steps = readSteps(data.steps ?? "", render);
    } catch (error) {
      if (error instanceof BrowserStepError) {
        throw new NonRetriableError(`Browser node: ${error.message}`);
      }
      throw error;
    }
    if (steps.length === 0) {
      throw new NonRetriableError("Browser node: Run Steps needs at least one step");
    }
  }

  const waitForSelector = render(data.waitForSelector ?? "").trim();
  const format = data.format === "text" ? "text" : "markdown";
  const maxCharacters = resolveMaxCharacters(render(data.maxCharacters ?? ""), {
    fallback: BROWSER_DEFAULT_CHARACTERS,
    max: BROWSER_MAX_CHARACTERS,
  });
  const timeoutSeconds = resolveBrowserTimeout(render(data.timeout ?? ""));

  // A credential is optional: without one the server's own browser is used
  const credentialUrl = data.credentialId
    ? await loadCredentialSecret({
        step,
        stepId: `browser-${nodeId}-get-credential`,
        credentialId: data.credentialId,
        userId,
        label,
      })
    : null;

  const result = await step.run(`browser-${nodeId}`, async () => {
    const endpoint = await resolveBrowserEndpoint(credentialUrl);
    const session = await openBrowserPage({ endpoint, timeoutSeconds });

    // The whole node has one deadline, whatever its steps do
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new NonRetriableError(
              `Browser node: the page took longer than the node's Timeout (${timeoutSeconds} seconds)`
            )
          ),
        timeoutSeconds * 1000
      );
    });

    const work = async () => {
      await gotoGuarded(session, url);

      if (operation === "steps") await runBrowserSteps(session, steps);

      if (waitForSelector) {
        await session.page.waitForSelector(waitForSelector, { visible: true }).catch(() => {
          throw new NonRetriableError(
            `Browser node: "${waitForSelector}" did not appear on the page`
          );
        });
      }

      if (operation === "screenshot") {
        const file = await screenshot(session, {
          fullPage: data.fullPage === "true",
          userId,
          executionId,
        });
        return { url: session.page.url().slice(0, 2000), title: (await session.page.title()).slice(0, 300), file };
      }

      const page = await readPage(session, { format, maxCharacters });
      // The links, buttons and fields with their selectors, for an AI Agent
      // that writes Run Steps next
      const elements = data.listElements === "true" ? await listPageElements(session) : undefined;
      const withElements = elements ? { ...page, elements } : page;

      if (operation === "steps" && data.screenshotAtEnd === "true") {
        return { ...withElements, file: await screenshot(session, { fullPage: false, userId, executionId }) };
      }

      return withElements;
    };

    try {
      return await Promise.race([work(), deadline]);
    } finally {
      clearTimeout(timer);
      await session.close();
    }
  });

  return { ...context, [variableName]: { ...result, operation } };
};
