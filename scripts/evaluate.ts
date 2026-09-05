import { parseArgs } from "node:util";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  manifestSchema,
  summarize,
  type EvalRow,
} from "../lib/evaluation/schema";
import {
  getConfig,
  MAX_OUTPUT_TOKENS,
  MODEL,
  PROMPT_VERSION,
} from "../lib/server/config";
import { validateImage } from "../lib/server/image-validation";
import { createAnalyzeHandler } from "../lib/server/analyze";
import { parseAnalysisResponse } from "../lib/contracts/analysis";
import type { AnalysisEvent } from "../lib/server/telemetry";
import {
  applicationTextBytes,
  createEvaluationReservation,
  EVALUATION_PRICING,
} from "../lib/evaluation/budget";
import {
  buildAnalysisInputText,
  loadPrompt,
  outputJsonSchema,
} from "../lib/server/ai/providers/openai";

const { values } = parseArgs({
  options: {
    manifest: {
      type: "string",
      default: "tests/evaluation/candidates/manifest.json",
    },
    split: { type: "string", default: "development" },
    execute: { type: "boolean", default: false },
    "budget-usd": { type: "string" },
    "max-calls": { type: "string" },
    "authorized-by": { type: "string" },
    output: { type: "string", default: "tests/evaluation/runs" },
  },
});
async function main() {
  const manifestPath = path.resolve(values.manifest!),
    raw = await readFile(manifestPath, "utf8"),
    manifest = manifestSchema.parse(JSON.parse(raw));
  if (!["development", "holdout", "demo"].includes(values.split!))
    throw new Error("split must be development, holdout or demo");
  const selected = manifest.cases.filter((c) =>
    values.split === "demo" ? c.demo : c.split === values.split,
  );
  if (!selected.length) throw new Error("No cases selected");
  const cases =
    values.split === "demo" ? selected.flatMap((c) => [c, c, c]) : selected;
  const imageBuffers = new Map<string, Buffer>();
  for (const c of selected) {
    const filename = path.resolve(path.dirname(manifestPath), c.image),
      root = path.dirname(manifestPath) + path.sep;
    if (!filename.startsWith(root))
      throw new Error("Image must stay within dataset directory");
    const bytes = await readFile(filename),
      mime = /\.png$/i.test(filename) ? "image/png" : "image/jpeg";
    await validateImage(
      {
        bytes,
        mime,
        filename: path.basename(filename),
        source: "screenshot",
        language: c.language,
      },
      AbortSignal.timeout(20000),
    );
    imageBuffers.set(c.caseId, bytes);
  }
  const pending = selected
    .filter((c) => c.reviewStatus !== "approved")
    .map((c) => c.caseId);
  const instructions = await loadPrompt(),
    schemaText = JSON.stringify(outputJsonSchema),
    requestTextBytes = Math.max(
      ...selected.map((c) =>
        applicationTextBytes([
          instructions,
          schemaText,
          buildAnalysisInputText(c.language, "screenshot"),
        ]),
      ),
    ),
    reservation = createEvaluationReservation({
      model: MODEL,
      applicationTextBytes: requestTextBytes,
      outputTokensPerCall: MAX_OUTPUT_TOKENS,
      calls: cases.length,
    });
  if (!values.execute) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        dataset: manifest.revision,
        split: values.split,
        cases: cases.length,
        validImages: imageBuffers.size,
        pendingHumanLabels: pending,
        paidCalls: 0,
        reservationPerCallUsd: reservation.perCallUsd,
        requiredBudgetUsd: reservation.requiredBudgetUsd,
      }),
    );
    return;
  }
  const budget = Number(values["budget-usd"]),
    maxCalls = Number(values["max-calls"]);
  if (
    !Number.isFinite(budget) ||
    budget <= 0 ||
    !Number.isInteger(maxCalls) ||
    maxCalls < cases.length ||
    !values["authorized-by"]?.trim()
  )
    throw new Error(
      "Explicit positive budget-usd, max-calls covering selected cases, and authorized-by required",
    );
  if (pending.length)
    throw new Error(
      "Human annotation and review required before paid evaluation",
    );
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const config = getConfig();
  if (config.mode !== "remote")
    throw new Error("Explicit remote config and key required");
  if (config.model !== EVALUATION_PRICING.model)
    throw new Error("Evaluation budget model must match remote config");
  if (reservation.requiredBudgetUsd > budget)
    throw new Error(
      `Bounded reservation exceeds authorized budget; need ${reservation.requiredBudgetUsd} USD for this run or select a smaller approved dataset`,
    );
  const runId =
      new Date().toISOString().replaceAll(":", "-") +
      "-" +
      crypto.randomUUID().slice(0, 8),
    output = path.resolve(values.output!);
  await mkdir(output, { recursive: true });
  const reportPath = path.join(output, `${runId}.json`),
    rows: EvalRow[] = [],
    gitRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  const baseReport = {
    runId,
    operator: values["authorized-by"],
    gitRevision,
    runtime: process.version,
    providerSdk: JSON.parse(
      await readFile("node_modules/openai/package.json", "utf8"),
    ).version,
    lockfileSha256: createHash("sha256")
      .update(await readFile("package-lock.json"))
      .digest("hex"),
    provider: "openai",
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    promptSha256: createHash("sha256")
      .update(await readFile("prompts/scam-analysis-v1.md"))
      .digest("hex"),
    schemaRevision: "v2",
    parameters: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
    datasetRevision: manifest.revision,
    datasetSha256: createHash("sha256").update(raw).digest("hex"),
    split: values.split,
    budgetUsd: budget,
    maxCalls,
    rates: EVALUATION_PRICING,
    reservation,
    deployUrl: null,
    timingScope:
      "local API pipeline including Provider; browser/upload/cold Vercel timing not measured",
  };
  // Allocate a unique report before the first paid call; persist each result.
  await writeFile(
    reportPath,
    JSON.stringify({ ...baseReport, state: "started", rows }, null, 2),
    { flag: "wx" },
  );
  for (const c of cases) {
    const accountedBefore = rows.reduce(
      (sum, row) => sum + (row.estimatedCostUsd ?? reservation.perCallUsd),
      0,
    );
    if (accountedBefore + reservation.perCallUsd > budget) {
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            ...baseReport,
            state: "stopped_budget",
            rows,
            summary: summarize(selected, rows),
          },
          null,
          2,
        ),
      );
      break;
    }
    const bytes = imageBuffers.get(c.caseId)!;
    const form = new FormData();
    form.set(
      "image",
      new Blob([new Uint8Array(bytes)], {
        type: /\.png$/i.test(c.image) ? "image/png" : "image/jpeg",
      }),
      path.basename(c.image),
    );
    form.set("source", "screenshot");
    form.set("language", c.language);
    let event: AnalysisEvent | undefined;
    const handler = createAnalyzeHandler({
        telemetry: (e) => {
          event = e;
        },
      }),
      start = performance.now();
    const response = await handler(
      new Request("http://localhost/analyze", { method: "POST", body: form }),
    );
    const parsed = parseAnalysisResponse(
      response.status,
      await response.json(),
    );
    const usage =
      event?.inputTokens !== undefined && event.outputTokens !== undefined
        ? { inputTokens: event.inputTokens, outputTokens: event.outputTokens }
        : undefined;
    rows.push({
      caseId: c.caseId,
      status: response.status,
      durationMs: performance.now() - start,
      ...("riskScore" in parsed
        ? { result: parsed }
        : { errorCode: parsed.error.code }),
      requestId: response.headers.get("x-request-id"),
      usage,
      estimatedCostUsd: usage
        ? (usage.inputTokens * EVALUATION_PRICING.inputPerMillionUsd +
            usage.outputTokens * EVALUATION_PRICING.outputPerMillionUsd) /
          1e6
        : undefined,
      humanReview: "pending",
    });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          ...baseReport,
          state:
            rows.length === cases.length
              ? "finished"
              : rows.reduce(
                    (sum, row) =>
                      sum +
                      (row.estimatedCostUsd ?? reservation.perCallUsd),
                    0,
                  ) +
                    reservation.perCallUsd >
                  budget
                ? "stopped_budget"
                : "running",
          rows,
          summary: summarize(selected, rows),
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        caseId: c.caseId,
        status: response.status,
        completed: rows.length,
        total: cases.length,
      }),
    );
    if (
      event?.failureKind === "configuration" ||
      rows.reduce(
        (sum, row) => sum + (row.estimatedCostUsd ?? reservation.perCallUsd),
        0,
      ) +
        reservation.perCallUsd >
        budget
    )
      break;
  }
  console.log(
    JSON.stringify({ report: reportPath, ...summarize(selected, rows) }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error && !(error.name === "ZodError")
      ? error.message
      : "Evaluation configuration or dataset invalid",
  );
  process.exitCode = 1;
});
