import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseAnalysisResponse } from "../lib/contracts/analysis";
import { validRequestId } from "../lib/feedback";
import {
  applicationTextBytes,
  createEvaluationReservation,
} from "../lib/evaluation/budget";
import { MAX_OUTPUT_TOKENS, MODEL } from "../lib/server/config";
import {
  buildAnalysisInputText,
  loadPrompt,
  outputJsonSchema,
} from "../lib/server/ai/providers/openai";
export async function runPreviewSmoke(
  args: string[],
  dependencies: {
    fetch?: typeof fetch;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: "string" },
      "ai-off": { type: "boolean", default: false },
      "expected-disabled-code": { type: "string" },
      image: { type: "string" },
      "allow-paid-call": { type: "boolean", default: false },
      "budget-usd": { type: "string" },
      "max-calls": { type: "string" },
      "authorized-by": { type: "string" },
    },
  });
  if (!values.url) throw new Error("--url is required");
  const base = new URL(values.url);
  if (base.protocol !== "https:" || base.username || base.password)
    throw new Error("Preview must use HTTPS without URL credentials");
  const aiOff = values["ai-off"];
  const expectedCode = values["expected-disabled-code"];
  const hasPaidFlags =
    values["allow-paid-call"] ||
    values["budget-usd"] !== undefined ||
    values["max-calls"] !== undefined ||
    values["authorized-by"] !== undefined;
  if (aiOff) {
    if (
      expectedCode !== "analysis_disabled" &&
      expectedCode !== "provider_unavailable"
    )
      throw new Error(
        "--ai-off requires --expected-disabled-code analysis_disabled or provider_unavailable",
      );
    if (values.image !== undefined || hasPaidFlags)
      throw new Error(
        "--ai-off cannot be combined with an image or paid flags",
      );
  } else if (expectedCode !== undefined) {
    throw new Error("--expected-disabled-code requires --ai-off");
  }
  // Validate paid authorization before any network request. AI OFF never reads
  // an image or prompt and can only send an invalid JSON upload.
  if (!values.image && hasPaidFlags)
    throw new Error("Paid flags require an explicitly approved --image");
  if (values.image) {
    if (
      !values["allow-paid-call"] ||
      !Number.isFinite(Number(values["budget-usd"])) ||
      Number(values["budget-usd"]) <= 0 ||
      Number(values["max-calls"]) !== 1 ||
      !values["authorized-by"]?.trim()
    )
      throw new Error(
        "An approved test image requires --allow-paid-call, --budget-usd, --max-calls 1, and --authorized-by",
      );
    const reservation = createEvaluationReservation({
      model: MODEL,
      applicationTextBytes: applicationTextBytes([
        await loadPrompt(),
        JSON.stringify(outputJsonSchema),
        buildAnalysisInputText("zh-TW", "screenshot"),
      ]),
      outputTokensPerCall: MAX_OUTPUT_TOKENS,
      calls: 1,
    });
    if (Number(values["budget-usd"]) < reservation.requiredBudgetUsd)
      throw new Error(
        `Approved --budget-usd must be at least ${reservation.requiredBudgetUsd}`,
      );
  }
  const transport = dependencies.fetch ?? fetch;
  const env = dependencies.env ?? process.env;
  const headers: Record<string, string> = {};
  // AI OFF is an anonymous acceptance check, even if an operator's shell has a
  // bypass secret. Never hide deployment protection behind that secret.
  if (!aiOff && env.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const request = (init: RequestInit) =>
    transport(new URL("/analyze", base), {
      ...init,
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(25000),
    });
  const checkHeaders = (response: Response, label: string) => {
    const requestId = validRequestId(response.headers.get("x-request-id"));
    if (
      response.headers.get("cache-control") !== "no-store" ||
      response.headers.get("content-type")?.split(";")[0].trim() !==
        "application/json" ||
      !requestId
    )
      throw new Error(`Preview headers gate failed: ${label}`);
    return requestId;
  };
  const parse = async (response: Response, label: string) => {
    try {
      return parseAnalysisResponse(response.status, await response.json());
    } catch {
      // Do not print third-party HTML, error bodies, or parser exception detail.
      throw new Error(
        `Preview contract gate failed: ${label} ${response.status}`,
      );
    }
  };
  const entries: {
    method: string;
    status: number;
    requestId: string;
    errorCode?: string;
  }[] = [];
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    const response = await request({ method, headers });
    if (response.status !== 405 || response.headers.get("allow") !== "POST")
      throw new Error(
        `Preview method gate failed: ${method} ${response.status}`,
      );
    const requestId = checkHeaders(response, method);
    if (method !== "HEAD") await parse(response, method);
    entries.push({ method, status: response.status, requestId });
  }
  const invalid = await request({
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: "{}",
  });
  const expectedStatus = aiOff ? 503 : 400;
  if (invalid.status !== expectedStatus)
    throw new Error(`Invalid-input gate failed: ${invalid.status}`);
  const requestId = checkHeaders(invalid, "POST invalid");
  const parsed = await parse(invalid, "POST invalid");
  const postCode = aiOff ? expectedCode : "invalid_request";
  if (!("error" in parsed) || parsed.error.code !== postCode)
    throw new Error("Preview expected error-code gate failed: POST invalid");
  entries.push({
    method: "POST invalid",
    status: invalid.status,
    requestId,
    errorCode: parsed.error.code,
  });
  if (values.image) {
    const bytes = await readFile(values.image),
      form = new FormData();
    form.set(
      "image",
      new Blob([new Uint8Array(bytes)], {
        type: /\.png$/i.test(values.image) ? "image/png" : "image/jpeg",
      }),
      path.basename(values.image),
    );
    form.set("source", "screenshot");
    form.set("language", "zh-TW");
    const response = await request({ method: "POST", headers, body: form });
    const imageRequestId = checkHeaders(response, "POST approved image");
    await parse(response, "POST approved image");
    entries.push({
      method: "POST approved image",
      status: response.status,
      requestId: imageRequestId,
    });
    if (response.status !== 200 && response.status !== 422)
      throw new Error(`Real Provider smoke incomplete: ${response.status}`);
  }
  return {
    url: base.origin,
    mode: aiOff ? "ai_off" : "standard",
    expectedDisabledCode: aiOff ? expectedCode : undefined,
    anonymousCheck: aiOff,
    entries,
    realProviderTested: Boolean(values.image),
    platformLimitsAccessCosts: "require separate deployment/operator evidence",
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  console.log(JSON.stringify(await runPreviewSmoke(process.argv.slice(2))));
