import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory()
          ? files(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const targets = [
  ...(await files(".next/static")),
  ...(await files(".next/server/app")).filter((f) => /\.(html|rsc)$/.test(f)),
];
const markers = [
  "Analyze only the provided screenshot for possible scam risk",
  "scam-analysis-v1",
  "AI_API_KEY",
  "https://api.openai.com/v1",
  "stub-only",
  "private-provider-error",
];
if (process.env.AI_API_KEY) markers.push(process.env.AI_API_KEY);
for (const file of targets) {
  const text = await readFile(file, "utf8");
  if (markers.some((m) => text.includes(m)))
    throw new Error(
      `Server-only marker found in browser-deliverable file: ${file}`,
    );
}
const trace = JSON.parse(
  await readFile(".next/server/app/analyze/route.js.nft.json", "utf8"),
);
if (!trace.files.some((f) => f.endsWith("prompts/scam-analysis-v1.md")))
  throw new Error("Prompt missing from route deployment trace");
if (!trace.files.some((f) => f.includes("sharp")))
  throw new Error("Sharp missing from route deployment trace");
console.log(
  JSON.stringify({
    browserDeliverableFilesScanned: targets.length,
    serverOnlyMarkersFound: 0,
    promptTraced: true,
    sharpTraced: true,
  }),
);
