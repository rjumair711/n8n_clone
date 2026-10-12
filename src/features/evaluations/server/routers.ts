import { Prisma, type NodeType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { PLAN_LIMITS, getRequiredPlanForNode } from "@/config/plans";
import { modelInput } from "@/features/ai-builder/server/routers";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { assertOwnership } from "@/lib/ownership";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
    EVAL_MAX_COMPARE,
    EVAL_MAX_DATASETS,
    EVAL_MAX_ROWS,
    EVAL_MAX_TEXT_CHARS,
    EVAL_SCORERS,
    EVAL_TRIGGERS,
    readJsonSchema,
    type EvalScorer,
} from "../lib/scoring";
import {
    EVAL_CANCEL_EVENT,
    EVAL_RESULT_STATUS,
    EVAL_RUN_EVENT,
    EVAL_RUN_STATUS,
} from "./run";

// Everything here belongs to a workflow, and is only ever read or changed
// by that workflow's owner. A dataset, a run or a row of someone else is
// "not found", like one that does not exist.

const getOwnedWorkflow = async (id: string, userId: string) =>
    assertOwnership(
        await prisma.workflow.findUnique({ where: { id } }),
        userId,
        "Workflow"
    );

const getOwnedDataset = async (id: string, userId: string) =>
    assertOwnership(
        await prisma.evalDataset.findUnique({
            where: { id },
            include: { workflow: { select: { userId: true, name: true, saveExecutionData: true } } },
        }),
        userId,
        "Dataset",
        (dataset) => dataset.workflow.userId
    );

const getOwnedRun = async (id: string, userId: string) =>
    assertOwnership(
        await prisma.evalRun.findUnique({
            where: { id },
            include: { dataset: { select: { workflow: { select: { userId: true } } } } },
        }),
        userId,
        "Evaluation run",
        (run) => run.dataset.workflow.userId
    );

const text = (max = EVAL_MAX_TEXT_CHARS) => z.string().max(max);

const datasetInput = z.object({
    name: z.string().trim().min(1, "Name the dataset").max(100),
    trigger: z.enum(EVAL_TRIGGERS),
    scorer: z.enum(EVAL_SCORERS),
    outputPath: z.string().trim().max(200).default(""),
    criteria: text().default(""),
    // Only read for the LLM judge
    judgeModel: modelInput.nullish(),
});

const rowInput = z.object({
    input: text().refine((value) => value.trim().length > 0, "A row needs an input"),
    expected: text().default(""),
});

const refuse = (message: string): never => {
    throw new TRPCError({ code: "BAD_REQUEST", message });
};

/**
 * What a dataset's settings must have for its scorer, checked when it is
 * saved, so a run does not find out row by row.
 */
const checkDataset = (input: z.infer<typeof datasetInput>) => {
    if (input.scorer === "llm_judge" && !input.judgeModel?.credentialId) {
        refuse("Pick the model the LLM judge uses.");
    }

    if (input.scorer === "json_schema" && input.criteria.trim()) {
        const schema = readJsonSchema(input.criteria);
        if (!schema.ok) refuse(schema.error);
    }
};

// A JSON schema in a row is checked when the row is saved
const checkRow = (scorer: string, expected: string) => {
    if (scorer === "json_schema" && expected.trim()) {
        const schema = readJsonSchema(expected);
        if (!schema.ok) refuse(schema.error);
    }
};

const toDatasetData = (input: z.infer<typeof datasetInput>) => ({
    name: input.name,
    trigger: input.trigger,
    scorer: input.scorer,
    outputPath: input.outputPath,
    criteria: input.criteria.trim() ? input.criteria : null,
    judgeModel:
        input.scorer === "llm_judge" && input.judgeModel
            ? (input.judgeModel as Prisma.InputJsonValue)
            : Prisma.DbNull,
});

const number = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

export const evaluationsRouter = createTRPCRouter({
    // The page: the workflow's datasets, and what a dataset can start from
    // and score
    getOverview: protectedProcedure
        .input(z.object({ workflowId: z.string() }))
        .query(async ({ ctx, input }) => {
            const workflow = await getOwnedWorkflow(input.workflowId, ctx.auth.user.id);

            const [datasets, nodes] = await Promise.all([
                prisma.evalDataset.findMany({
                    where: { workflowId: workflow.id },
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        name: true,
                        scorer: true,
                        _count: { select: { rows: true, runs: true } },
                    },
                }),
                prisma.node.findMany({
                    where: { workflowId: workflow.id },
                    select: { type: true, data: true },
                }),
            ]);

            const types = new Set<string>(nodes.map((node) => node.type));

            return {
                workflow: {
                    id: workflow.id,
                    name: workflow.name,
                    saveExecutionData: workflow.saveExecutionData,
                },
                datasets: datasets.map((dataset) => ({
                    id: dataset.id,
                    name: dataset.name,
                    scorer: dataset.scorer,
                    rows: dataset._count.rows,
                    runs: dataset._count.runs,
                })),
                // The triggers the saved workflow has, of those a row can start
                triggers: EVAL_TRIGGERS.filter((trigger) => types.has(trigger)),
                // Names to pick "Output to score" from
                variables: [
                    ...new Set(
                        nodes.flatMap((node) => {
                            const name = (node.data as { variableName?: unknown } | null)?.variableName;

                            return typeof name === "string" && name.trim() ? [name.trim()] : [];
                        })
                    ),
                ].sort(),
            };
        }),

    getDataset: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const { workflow, ...dataset } = await getOwnedDataset(input.id, ctx.auth.user.id);

            const rows = await prisma.evalRow.findMany({
                where: { datasetId: dataset.id },
                orderBy: { position: "asc" },
                select: { id: true, position: true, input: true, expected: true },
            });

            return { ...dataset, rows };
        }),

    createDataset: protectedProcedure
        .input(datasetInput.extend({ workflowId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const workflow = await getOwnedWorkflow(input.workflowId, ctx.auth.user.id);
            checkDataset(input);

            const count = await prisma.evalDataset.count({ where: { workflowId: workflow.id } });
            if (count >= EVAL_MAX_DATASETS) {
                refuse(`A workflow can have ${EVAL_MAX_DATASETS} datasets. Delete one first.`);
            }

            const dataset = await prisma.evalDataset.create({
                data: { workflowId: workflow.id, ...toDatasetData(input) },
                select: { id: true },
            });

            return dataset;
        }),

    updateDataset: protectedProcedure
        .input(datasetInput.extend({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const dataset = await getOwnedDataset(input.id, ctx.auth.user.id);
            checkDataset(input);

            await prisma.evalDataset.update({
                where: { id: dataset.id },
                data: toDatasetData(input),
            });

            return { id: dataset.id };
        }),

    removeDataset: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const dataset = await getOwnedDataset(input.id, ctx.auth.user.id);

            // Its rows, runs and results go with it. A run that is still
            // going finds nothing left and stops.
            await prisma.evalDataset.delete({ where: { id: dataset.id } });

            return { id: dataset.id };
        }),

    // ROWS
    // One row, or many at once (pasted as JSON)
    addRows: protectedProcedure
        .input(
            z.object({
                datasetId: z.string(),
                rows: z.array(rowInput).min(1).max(EVAL_MAX_ROWS),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const dataset = await getOwnedDataset(input.datasetId, ctx.auth.user.id);

            for (const row of input.rows) checkRow(dataset.scorer, row.expected);

            const last = await prisma.evalRow.findFirst({
                where: { datasetId: dataset.id },
                orderBy: { position: "desc" },
                select: { position: true },
            });
            const count = await prisma.evalRow.count({ where: { datasetId: dataset.id } });

            if (count + input.rows.length > EVAL_MAX_ROWS) {
                refuse(`A dataset can have ${EVAL_MAX_ROWS} rows. This one has ${count}.`);
            }

            await prisma.evalRow.createMany({
                data: input.rows.map((row, index) => ({
                    datasetId: dataset.id,
                    position: (last?.position ?? 0) + index + 1,
                    input: row.input,
                    expected: row.expected.trim() ? row.expected : null,
                })),
            });

            return { added: input.rows.length };
        }),

    updateRow: protectedProcedure
        .input(rowInput.extend({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const row = assertOwnership(
                await prisma.evalRow.findUnique({
                    where: { id: input.id },
                    include: {
                        dataset: { select: { scorer: true, workflow: { select: { userId: true } } } },
                    },
                }),
                ctx.auth.user.id,
                "Row",
                (found) => found.dataset.workflow.userId
            );

            checkRow(row.dataset.scorer, input.expected);

            await prisma.evalRow.update({
                where: { id: row.id },
                data: {
                    input: input.input,
                    expected: input.expected.trim() ? input.expected : null,
                },
            });

            return { id: row.id };
        }),

    removeRow: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const row = assertOwnership(
                await prisma.evalRow.findUnique({
                    where: { id: input.id },
                    include: { dataset: { select: { workflow: { select: { userId: true } } } } },
                }),
                ctx.auth.user.id,
                "Row",
                (found) => found.dataset.workflow.userId
            );

            // Results of earlier runs keep their own copy of the row
            await prisma.evalRow.delete({ where: { id: row.id } });

            return { id: row.id };
        }),

    // RUNS
    // Runs the saved workflow once for every row. The rows are real
    // executions: they count towards the plan, and their nodes do what
    // they do (send the message, write the record).
    startRun: protectedProcedure
        .input(
            z.object({
                datasetId: z.string(),
                label: z.string().trim().max(60).default(""),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.auth.user.id;
            const dataset = await getOwnedDataset(input.datasetId, userId);

            // What is scored is read from the saved result of each run
            if (!dataset.workflow.saveExecutionData) {
                refuse(
                    'This workflow is set to "Don\'t save node input/output", so there is no result to score. Turn saving on in the workflow\'s settings to evaluate it.'
                );
            }

            const [rows, triggerNode, running, user] = await Promise.all([
                prisma.evalRow.findMany({
                    where: { datasetId: dataset.id },
                    orderBy: { position: "asc" },
                    select: { id: true, input: true, expected: true },
                }),
                prisma.node.findFirst({
                    where: { workflowId: dataset.workflowId, type: dataset.trigger as NodeType },
                    select: { id: true },
                }),
                prisma.evalRun.findFirst({
                    where: {
                        status: EVAL_RUN_STATUS.RUNNING,
                        dataset: { workflowId: dataset.workflowId },
                    },
                    select: { id: true },
                }),
                prisma.user.findUniqueOrThrow({
                    where: { id: userId },
                    select: { plan: true, trialEndsAt: true },
                }),
            ]);

            if (rows.length === 0) refuse("Add at least one row to the dataset first.");

            if (!triggerNode) {
                refuse("The saved workflow does not have this dataset's trigger. Save the workflow, or pick another trigger in the dataset's settings.");
            }

            if (running) {
                refuse("An evaluation of this workflow is still running. Wait for it, or cancel it.");
            }

            // Plan locks and the month's executions apply as they do to a
            // run from the editor
            const requiredPlan = getRequiredPlanForNode(dataset.trigger, user.plan, user.trialEndsAt);
            if (requiredPlan) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `This trigger requires the ${requiredPlan} plan.`,
                });
            }

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const executionsThisMonth = await prisma.execution.count({
                where: { workflow: { userId }, startedAt: { gte: startOfMonth } },
            });
            const executionLimit = PLAN_LIMITS[user.plan].monthlyExecutions;

            if (executionsThisMonth + rows.length > executionLimit) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `This evaluation needs ${rows.length} executions, and your plan has ${Math.max(executionLimit - executionsThisMonth, 0)} of its ${executionLimit} left this month.`,
                });
            }

            const count = await prisma.evalRun.count({ where: { datasetId: dataset.id } });

            const run = await prisma.evalRun.create({
                data: {
                    datasetId: dataset.id,
                    label: input.label || `Run ${count + 1}`,
                    scorer: dataset.scorer,
                    rowsTotal: rows.length,
                    results: {
                        create: rows.map((row, index) => ({
                            rowId: row.id,
                            position: index + 1,
                            input: row.input,
                            expected: row.expected,
                        })),
                    },
                },
                select: { id: true },
            });

            try {
                await inngest.send({ name: EVAL_RUN_EVENT, data: { runId: run.id } });
            } catch {
                await prisma.evalRun.update({
                    where: { id: run.id },
                    data: {
                        status: EVAL_RUN_STATUS.FAILED,
                        error: "The evaluation could not be started. Try again.",
                        completedAt: new Date(),
                    },
                });

                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "The evaluation could not be started. Try again.",
                });
            }

            return run;
        }),

    // Stops a run after the row it is on. Rows that did not run stay "Not run".
    cancelRun: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const run = await getOwnedRun(input.id, ctx.auth.user.id);

            const cancelled = await prisma.evalRun.updateMany({
                where: { id: run.id, status: EVAL_RUN_STATUS.RUNNING },
                data: { status: EVAL_RUN_STATUS.CANCELLED, completedAt: new Date() },
            });

            if (cancelled.count > 0) {
                await inngest.send({ name: EVAL_CANCEL_EVENT, data: { runId: run.id } });
            }

            return { id: run.id, cancelled: cancelled.count > 0 };
        }),

    removeRun: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const run = await getOwnedRun(input.id, ctx.auth.user.id);

            if (run.status === EVAL_RUN_STATUS.RUNNING) {
                refuse("Cancel the run before deleting it.");
            }

            await prisma.evalRun.delete({ where: { id: run.id } });

            return { id: run.id };
        }),

    // A dataset's runs, newest first: score, cost and latency of each
    getRuns: protectedProcedure
        .input(z.object({ datasetId: z.string() }))
        .query(async ({ ctx, input }) => {
            const dataset = await getOwnedDataset(input.datasetId, ctx.auth.user.id);

            const runs = await prisma.evalRun.findMany({
                where: { datasetId: dataset.id },
                orderBy: { startedAt: "desc" },
                take: 50,
            });

            return runs.map((run) => ({
                id: run.id,
                label: run.label,
                status: run.status,
                scorer: run.scorer as EvalScorer,
                workflowVersionNumber: run.workflowVersionNumber,
                models: Array.isArray(run.models) ? run.models.map(String) : [],
                rowsTotal: run.rowsTotal,
                rowsDone: run.rowsDone,
                rowsPassed: run.rowsPassed,
                score: run.score,
                costUsd: number(run.costUsd),
                judgeCostUsd: number(run.judgeCostUsd),
                avgDurationMs: run.avgDurationMs,
                error: run.error,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
            }));
        }),

    // The rows of up to four runs of one dataset, side by side
    getResults: protectedProcedure
        .input(
            z.object({
                datasetId: z.string(),
                runIds: z.array(z.string()).min(1).max(EVAL_MAX_COMPARE),
            })
        )
        .query(async ({ ctx, input }) => {
            const dataset = await getOwnedDataset(input.datasetId, ctx.auth.user.id);

            // Only runs of this dataset: another dataset's id finds nothing
            const results = await prisma.evalResult.findMany({
                where: { runId: { in: input.runIds }, run: { datasetId: dataset.id } },
                orderBy: [{ position: "asc" }],
                select: {
                    id: true,
                    runId: true,
                    rowId: true,
                    position: true,
                    input: true,
                    expected: true,
                    status: true,
                    output: true,
                    score: true,
                    passed: true,
                    reason: true,
                    error: true,
                    executionId: true,
                    durationMs: true,
                    costUsd: true,
                    judgeCostUsd: true,
                },
            });

            return results.map((result) => ({
                ...result,
                pending: result.status === EVAL_RESULT_STATUS.PENDING,
                costUsd: number(result.costUsd),
                judgeCostUsd: number(result.judgeCostUsd),
            }));
        }),
});
