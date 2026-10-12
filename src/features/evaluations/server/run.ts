import "server-only";

import { ExecutionStatus, type Prisma } from "@prisma/client";
import { generateText } from "ai";
import type z from "zod";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";
import {
  loadBuilderModel,
  modelInput,
} from "@/features/ai-builder/server/routers";
import { normalizeUsage } from "@/lib/ai-cost";
import { getAccountAiBudgetProblem, recordAiUsage } from "@/lib/ai-usage";
import prisma from "@/lib/db";
import { redactString } from "@/lib/redaction";
import {
  EVAL_JUDGE_SYSTEM,
  EVAL_JUDGE_USAGE_NAME,
  EVAL_MAX_OUTPUT_CHARS,
  buildJudgePrompt,
  cutText,
  isEvalScorer,
  outputToText,
  parseJudgeReply,
  readOutputPath,
  scoreOutput,
  summarizeResults,
  type RowScore,
} from "../lib/scoring";

// The database side of an evaluation run. The Inngest function in
// src/inngest/evaluations.ts calls these, each inside a step.

export const EVAL_RUN_EVENT = "evaluations/run";
export const EVAL_CANCEL_EVENT = "evaluations/run.cancel";

export const EVAL_RUN_STATUS = {
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export const EVAL_RESULT_STATUS = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const;

const JUDGE_TIMEOUT_MS = 60_000;

type JudgeModel = z.infer<typeof modelInput>;

/**
 * What the function needs to know about a run, and the rows still to do.
 * Null when the run is gone or no longer running (cancelled, or deleted
 * with its dataset).
 */
export const loadEvalRun = async (runId: string) => {
  const run = await prisma.evalRun.findUnique({
    where: { id: runId },
    select: {
      status: true,
      dataset: {
        select: {
          trigger: true,
          workflowId: true,
          workflow: { select: { userId: true } },
        },
      },
      results: {
        where: { status: EVAL_RESULT_STATUS.PENDING },
        orderBy: { position: "asc" },
        select: { id: true, position: true, input: true },
      },
    },
  });

  if (!run || run.status !== EVAL_RUN_STATUS.RUNNING) return null;

  return {
    workflowId: run.dataset.workflowId,
    userId: run.dataset.workflow.userId,
    trigger: run.dataset.trigger,
    rows: run.results,
  };
};

/**
 * The execution a row runs as. The engine needs the row to exist before
 * its event arrives. Null when the run was cancelled in the meantime.
 */
export const startEvalRow = async ({
  runId,
  resultId,
  workflowId,
  userId,
}: {
  runId: string;
  resultId: string;
  workflowId: string;
  userId: string;
}) => {
  const run = await prisma.evalRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (run?.status !== EVAL_RUN_STATUS.RUNNING) return null;

  const execution = await prisma.execution.create({
    data: {
      workflowId,
      status: ExecutionStatus.RUNNING,
      triggerSource: TRIGGER_SOURCES.EVALUATION,
    },
  });

  await prisma.evalResult.update({
    where: { id: resultId },
    data: { executionId: execution.id },
  });

  // A row is an execution like any other, and counts as one
  await prisma.user.update({
    where: { id: userId },
    data: { executionsUsed: { increment: 1 } },
  });

  return execution.id;
};

const usd = (value: Prisma.Decimal | null | undefined) => Number(value ?? 0);

/**
 * Asks the judge's model for a score. The key never leaves this function:
 * what the provider says about a failure is cleaned of it.
 */
const judgeOutput = async ({
  userId,
  workflowId,
  executionId,
  judgeModel,
  prompt,
}: {
  userId: string;
  workflowId: string;
  executionId: string;
  judgeModel: JudgeModel;
  prompt: string;
}): Promise<RowScore | { error: string }> => {
  // The account's monthly AI budget stops the judge like it stops a node
  const budgetProblem = await getAccountAiBudgetProblem(userId);
  if (budgetProblem) return { error: budgetProblem };

  let loaded: Awaited<ReturnType<typeof loadBuilderModel>>;
  try {
    loaded = await loadBuilderModel(userId, judgeModel, "The evaluation judge");
  } catch (error) {
    return { error: `The judge's model could not be used: ${(error as Error).message}` };
  }

  try {
    const result = await generateText({
      model: loaded.model,
      system: EVAL_JUDGE_SYSTEM,
      prompt,
      abortSignal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
      maxRetries: 1,
    });

    // On the row's execution, under a name of its own, so it is part of
    // the month's spend and can be told from what the workflow itself cost
    await recordAiUsage({
      scope: { userId, workflowId, executionId, nodeName: EVAL_JUDGE_USAGE_NAME },
      provider: loaded.usageProvider,
      model: loaded.modelName,
      usage: normalizeUsage(result.totalUsage),
      included: loaded.included,
    });

    return (
      parseJudgeReply(result.text) ?? {
        error: "The judge did not answer with a score. Try a stronger model for the judge.",
      }
    );
  } catch (error) {
    return {
      error: `The judge's model could not be used: ${redactString(
        String((error as Error)?.message ?? error),
        { secrets: [loaded.apiKey] }
      ).slice(0, 300)}`,
    };
  }
};

/**
 * Reads how a row's execution ended, scores what it produced and writes
 * the result down.
 */
export const scoreEvalRow = async ({
  runId,
  resultId,
  executionId,
}: {
  runId: string;
  resultId: string;
  executionId: string;
}) => {
  const [result, execution] = await Promise.all([
    prisma.evalResult.findUnique({
      where: { id: resultId },
      select: {
        input: true,
        expected: true,
        run: {
          select: {
            scorer: true,
            dataset: {
              select: {
                outputPath: true,
                criteria: true,
                judgeModel: true,
                workflowId: true,
                workflow: { select: { userId: true } },
              },
            },
          },
        },
      },
    }),
    prisma.execution.findUnique({
      where: { id: executionId },
      select: { status: true, error: true, output: true, durationMs: true },
    }),
  ]);

  // The run was deleted while it was going
  if (!result) return;

  const { scorer, dataset } = result.run;
  const userId = dataset.workflow.userId;

  let outcome: {
    status: string;
    output?: string;
    score: number;
    passed: boolean;
    reason?: string;
    error?: string;
  };

  if (execution?.status !== ExecutionStatus.SUCCESS) {
    outcome = {
      status: EVAL_RESULT_STATUS.FAILED,
      score: 0,
      passed: false,
      error:
        execution?.status === ExecutionStatus.FAILED
          ? execution.error || "The workflow failed."
          : execution?.status === ExecutionStatus.WAITING
            ? "The workflow is waiting (a Wait, Form or approval node). A row has to finish on its own."
            : "The workflow did not finish in time.",
    };
  } else {
    const value = dataset.outputPath.trim()
      ? readOutputPath(execution.output, dataset.outputPath)
      : execution.output;
    const output = cutText(outputToText(value), EVAL_MAX_OUTPUT_CHARS);
    const expected = result.expected?.trim() ? result.expected : (dataset.criteria ?? "");

    if (value === undefined || value === null) {
      outcome = {
        status: EVAL_RESULT_STATUS.SUCCESS,
        output,
        score: 0,
        passed: false,
        reason: dataset.outputPath.trim()
          ? `The run has nothing at "${dataset.outputPath.trim()}": the node did not run, or the name is not a variable of this workflow.`
          : "The run produced no data.",
      };
    } else if (!isEvalScorer(scorer)) {
      outcome = {
        status: EVAL_RESULT_STATUS.FAILED,
        output,
        score: 0,
        passed: false,
        error: `Unknown scorer "${scorer}".`,
      };
    } else if (scorer !== "llm_judge") {
      outcome = {
        status: EVAL_RESULT_STATUS.SUCCESS,
        output,
        ...scoreOutput({ scorer, value, expected }),
      };
    } else {
      const judgeModel = modelInput.safeParse(dataset.judgeModel);
      const rowExpected = result.expected?.trim() ?? "";
      const criteria = dataset.criteria?.trim() ?? "";

      const judged = !judgeModel.success
        ? { error: "This dataset has no model for the LLM judge. Pick one in the dataset's settings." }
        : !rowExpected && !criteria
          ? { error: "This row has no expected answer, and the dataset has no grading criteria." }
          : await judgeOutput({
              userId,
              workflowId: dataset.workflowId,
              executionId,
              judgeModel: judgeModel.data,
              prompt: buildJudgePrompt({
                input: result.input,
                expected: rowExpected,
                criteria,
                output,
              }),
            });

      outcome =
        "error" in judged
          ? {
              status: EVAL_RESULT_STATUS.FAILED,
              output,
              score: 0,
              passed: false,
              error: judged.error,
            }
          : { status: EVAL_RESULT_STATUS.SUCCESS, output, ...judged };
    }
  }

  // What the row cost: the workflow's own model calls, and the judge's
  const usage = await prisma.aiUsage.findMany({
    where: { executionId },
    select: { nodeId: true, nodeName: true, costUsd: true },
  });
  const isJudge = (row: (typeof usage)[number]) =>
    row.nodeId === null && row.nodeName === EVAL_JUDGE_USAGE_NAME;

  await prisma.evalResult.update({
    where: { id: resultId },
    data: {
      status: outcome.status,
      output: outcome.output ?? null,
      score: outcome.score,
      passed: outcome.passed,
      reason: outcome.reason ?? null,
      error: outcome.error ? cutText(outcome.error, 2000) : null,
      durationMs: execution?.durationMs ?? null,
      costUsd: usage.filter((row) => !isJudge(row)).reduce((sum, row) => sum + usd(row.costUsd), 0),
      judgeCostUsd: usage.filter(isJudge).reduce((sum, row) => sum + usd(row.costUsd), 0),
    },
  });

  await writeEvalRunTotals(runId);
};

/**
 * The run's totals from its rows, so the page shows progress while the run
 * is going. With `finish`, the run is over.
 */
export const writeEvalRunTotals = async (runId: string, finish = false) => {
  const run = await prisma.evalRun.findUnique({
    where: { id: runId },
    select: {
      status: true,
      results: {
        select: {
          status: true,
          score: true,
          passed: true,
          durationMs: true,
          costUsd: true,
          judgeCostUsd: true,
          executionId: true,
        },
      },
    },
  });

  if (!run) return;

  const totals = summarizeResults(
    run.results.map((result) => ({
      ...result,
      costUsd: result.costUsd === null ? null : Number(result.costUsd),
      judgeCostUsd: result.judgeCostUsd === null ? null : Number(result.judgeCostUsd),
    }))
  );

  const executionIds = run.results.flatMap((result) => result.executionId ?? []);

  // Which version of the workflow ran, and which models answered: what
  // tells "model A" from "model B" on the results page
  const [versions, models] =
    executionIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.execution.findMany({
            where: { id: { in: executionIds }, workflowVersionNumber: { not: null } },
            select: { workflowVersionNumber: true },
            orderBy: { startedAt: "desc" },
            take: 1,
          }),
          prisma.aiUsage.groupBy({
            by: ["provider", "model"],
            where: { executionId: { in: executionIds }, nodeId: { not: null }, kind: "chat" },
          }),
        ]);

  await prisma.evalRun.updateMany({
    // A run that was cancelled stays cancelled
    where: { id: runId, ...(finish ? { status: EVAL_RUN_STATUS.RUNNING } : {}) },
    data: {
      ...totals,
      workflowVersionNumber: versions[0]?.workflowVersionNumber ?? null,
      models: models.map((entry) => `${entry.provider}/${entry.model}`).sort(),
      ...(finish ? { status: EVAL_RUN_STATUS.SUCCESS, completedAt: new Date() } : {}),
    },
  });
};

export const failEvalRun = async (runId: string, message: string) => {
  await prisma.evalRun.updateMany({
    where: { id: runId, status: EVAL_RUN_STATUS.RUNNING },
    data: {
      status: EVAL_RUN_STATUS.FAILED,
      error: redactString(message).slice(0, 2000),
      completedAt: new Date(),
    },
  });
};
