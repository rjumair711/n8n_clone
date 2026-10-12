import { NonRetriableError, referenceFunction } from "inngest";
import { inngest } from "./client";
import {
  buildEvalInitialData,
  isEvalTrigger,
} from "@/features/evaluations/lib/scoring";
import {
  EVAL_CANCEL_EVENT,
  EVAL_RUN_EVENT,
  failEvalRun,
  loadEvalRun,
  scoreEvalRow,
  startEvalRow,
  writeEvalRunTotals,
} from "@/features/evaluations/server/run";

// How long one row's run may take before the row counts as failed
const ROW_TIMEOUT = "10m";

/**
 * Runs a workflow over an evaluation dataset: one execution per row, one
 * after the other, each scored when it ends. The rows are real runs of the
 * saved workflow, from its trigger on.
 */
export const runEvaluation = inngest.createFunction(
  {
    id: "run-evaluation",
    // A step that is tried again would run its row, or pay its judge, twice
    retries: 0,
    cancelOn: [{ event: EVAL_CANCEL_EVENT, match: "data.runId" }],
    onFailure: async ({ event, error }) => {
      const runId = event.data.event.data.runId;

      if (typeof runId === "string") {
        await failEvalRun(runId, error?.message ?? "The evaluation stopped.").catch(() => {});
      }
    },
  },
  { event: EVAL_RUN_EVENT },
  async ({ event, step }) => {
    const runId = event.data.runId;

    if (typeof runId !== "string" || !runId) {
      throw new NonRetriableError("Evaluation run ID is missing");
    }

    const run = await step.run("load-run", () => loadEvalRun(runId));

    // Cancelled or deleted before it began
    if (!run) return { runId, rows: 0 };

    if (!isEvalTrigger(run.trigger)) {
      throw new NonRetriableError(`An evaluation cannot start from "${run.trigger}".`);
    }

    for (const row of run.rows) {
      const executionId = await step.run(`start-row-${row.position}`, () =>
        startEvalRow({
          runId,
          resultId: row.id,
          workflowId: run.workflowId,
          userId: run.userId,
        })
      );

      // The run was cancelled: nothing more is started
      if (!executionId) break;

      try {
        await step.invoke(`run-row-${row.position}`, {
          // Referenced by id, like the Execute Workflow node does
          function: referenceFunction({ functionId: "execute-workflow" }),
          data: {
            workflowId: run.workflowId,
            executionId,
            trigger: run.trigger,
            InitialData: buildEvalInitialData(
              run.trigger,
              row.input,
              `eval-${runId}-${row.position}`
            ),
          },
          timeout: ROW_TIMEOUT,
        });
      } catch {
        // A row whose workflow failed is a result, not the end of the
        // evaluation. How it ended is read from the execution.
      }

      await step.run(`score-row-${row.position}`, () =>
        scoreEvalRow({ runId, resultId: row.id, executionId })
      );
    }

    await step.run("finish-run", () => writeEvalRunTotals(runId, true));

    return { runId, rows: run.rows.length };
  }
);
