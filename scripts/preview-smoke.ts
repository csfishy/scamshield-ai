import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAnalysisResponse } from "../lib/contracts/analysis";
const { values } = parseArgs({
  options: {
    url: { type: "string" },
    image: { type: "string" },
    "allow-paid-call": { type: "boolean", default: false },
  },
});
if (!values.url) throw new Error("--url is required");
const base = new URL(values.url);
if (base.protocol !== "https:") throw new Error("Preview must use HTTPS");
const headers: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
  headers["x-vercel-protection-bypass"] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const entries = [];
for (const method of ["GET", "HEAD", "OPTIONS"]) {
  const response = await fetch(new URL("/analyze", base), {
    method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
  if (
    response.status !== 405 ||
    response.headers.get("allow") !== "POST" ||
    response.headers.get("cache-control") !== "no-store"
  )
    throw new Error(`Preview method gate failed: ${method} ${response.status}`);
  if (method !== "HEAD")
    parseAnalysisResponse(response.status, await response.json());
  entries.push({ method, status: response.status });
}
const invalid = await fetch(new URL("/analyze", base), {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: "{}",
  redirect: "manual",
  signal: AbortSignal.timeout(25000),
});
if (invalid.status !== 400)
  throw new Error(`Invalid-input gate failed: ${invalid.status}`);
parseAnalysisResponse(400, await invalid.json());
entries.push({ method: "POST invalid", status: 400 });
if (values.image) {
  if (!values["allow-paid-call"])
    throw new Error(
      "An approved test image requires explicit --allow-paid-call plus existing budget authorization",
    );
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
  const response = await fetch(new URL("/analyze", base), {
    method: "POST",
    headers,
    body: form,
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
  parseAnalysisResponse(response.status, await response.json());
  entries.push({ method: "POST approved image", status: response.status });
  if (response.status !== 200 && response.status !== 422)
    throw new Error(`Real Provider smoke incomplete: ${response.status}`);
}
console.log(
  JSON.stringify({
    url: base.origin,
    entries,
    realProviderTested: Boolean(values.image),
    platformLimitsAccessCosts: "require separate deployment/operator evidence",
  }),
);
