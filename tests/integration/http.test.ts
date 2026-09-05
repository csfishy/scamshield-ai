import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { normal } from "../../fixtures/demo";
import { parseAnalysisResponse, LIMITS } from "../../lib/contracts/analysis";
import { png, jpeg, multipart, type Part } from "../helpers/images";

const providerAnalysis = {
  riskScore: normal.riskScore,
  category: normal.category,
  summary: normal.summary,
  signals: normal.signals,
  recommendations: normal.recommendations,
};

// This test starts a real Next.js HTTP endpoint from a fresh copy of production
// modules. Only the route dependency wiring differs. The SDK reaches a loopback
// stub; no production source includes the stub URL, response selector or counter.
let next: ChildProcess | undefined,
  stub: Server,
  base: string,
  calls = 0,
  scenario = "normal",
  serverLog = "";
function portOf(server: Server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  return address.port;
}
async function port() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const value = portOf(server);
  await new Promise<void>((r) => server.close(() => r()));
  return value;
}
beforeAll(async () => {
  stub = createServer(async (req, res) => {
    calls++;
    for await (const _ of req) {
      void _;
    }
    res.setHeader("Content-Type", "application/json");
    if (scenario === "rate") {
      res.writeHead(429, { "Retry-After": "25" });
      res.end('{"error":{"message":"private-provider-error"}}');
      return;
    }
    if (scenario === "unavailable") {
      res.writeHead(503);
      res.end("{}");
      return;
    }
    const outcome =
      scenario === "insufficient"
        ? { status: "insufficient_evidence", reason: "unreadable" }
        : scenario === "unknown"
          ? { status: "analyzed", ...providerAnalysis, category: "unknown" }
          : { status: "analyzed", ...providerAnalysis };
    const content =
      scenario === "refusal"
        ? [{ type: "refusal", refusal: "private-refusal" }]
        : [
            {
              type: "output_text",
              text:
                scenario === "malformed"
                  ? "bad json"
                  : JSON.stringify({ outcome }),
              annotations: [],
            },
          ];
    res.end(
      JSON.stringify({
        id: "resp_stub",
        object: "response",
        created_at: 0,
        status: "completed",
        output: [
          {
            id: "msg_stub",
            type: "message",
            status: "completed",
            role: "assistant",
            content,
          },
        ],
        usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
      }),
    );
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  const root = path.resolve(".tools/http-app");
  await mkdir(root, { recursive: true });
  for (const dir of ["lib", "prompts"])
    await cp(path.resolve(dir), path.join(root, dir), { recursive: true });
  await mkdir(path.join(root, "app/analyze"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "scamshield-http-test", private: true }),
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "esnext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
      exclude: ["node_modules"],
    }),
  );
  await writeFile(
    path.join(root, "next.config.mjs"),
    `export default {serverExternalPackages:['sharp'], devIndicators:false};`,
  );
  await writeFile(
    path.join(root, "app/layout.tsx"),
    "export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}",
  );
  await writeFile(
    path.join(root, "app/page.tsx"),
    "export default function Page(){return <main>HTTP test harness</main>}",
  );
  await writeFile(
    path.join(root, "app/analyze/route.ts"),
    `import {createAnalyzeHandler} from '../../lib/server/analyze';
import {createOpenAIProvider} from '../../lib/server/ai/providers/openai';
import {MODEL,PROMPT_VERSION} from '../../lib/server/config';
export const runtime='nodejs'; export const maxDuration=30;
export const POST=createAnalyzeHandler({config:()=>({mode:'remote',provider:'openai',model:MODEL,apiKey:'stub-only',providerTimeoutMs:15000,apiTimeoutMs:20000,promptVersion:PROMPT_VERSION}),provider:c=>createOpenAIProvider(c,(_url,init)=>fetch('http://127.0.0.1:${portOf(stub)}/responses',init))});
export const GET=POST, HEAD=POST, OPTIONS=POST, PUT=POST, PATCH=POST, DELETE=POST;`,
  );
  const nextPort = await port();
  base = `http://127.0.0.1:${nextPort}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.NODE_OPTIONS;
  next = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "dev",
      root,
      "--webpack",
      "-H",
      "127.0.0.1",
      "-p",
      String(nextPort),
    ],
    { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  next.stdout?.on("data", (b) => {
    serverLog = (serverLog + b.toString()).slice(-12000);
  });
  next.stderr?.on("data", (b) => {
    serverLog = (serverLog + b.toString()).slice(-12000);
  });
  for (let i = 0; i < 90; i++) {
    if (next.exitCode !== null) throw new Error(`Next failed: ${serverLog}`);
    try {
      const response = await fetch(`${base}/analyze`);
      if (response.status === 405) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next did not start: ${serverLog}`);
});
afterAll(async () => {
  if (next?.pid && next.exitCode === null) {
    if (process.platform === "win32")
      spawnSync("taskkill.exe", ["/PID", String(next.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else next.kill();
  }
  if (next && next.exitCode === null)
    await Promise.race([
      new Promise<void>((r) => next!.once("exit", () => r())),
      new Promise<void>((r) => setTimeout(r, 3000)),
    ]);
  stub?.closeAllConnections();
  await new Promise<void>((r) => (stub ? stub.close(() => r()) : r()));
});
async function post(parts: Part[], extra = 0) {
  const body = multipart(parts);
  return fetch(`${base}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=scamshield-test",
    },
    body: new Uint8Array(Buffer.concat([body, Buffer.alloc(extra)])),
  });
}
async function imagePart(format = "png"): Promise<Part> {
  return {
    name: "image",
    filename: `image.${format}`,
    mime: `image/${format}`,
    data: format === "png" ? await png() : await jpeg(),
  };
}
describe("real Next.js + SDK HTTP integration", () => {
  it("PNG/JPEG, fields/defaults, clean HTTP headers, calls exactly once", async () => {
    for (const format of ["png", "jpeg"]) {
      scenario = "normal";
      const before = calls;
      const response = await post([await imagePart(format)]);
      expect(response.status).toBe(200);
      expect(
        parseAnalysisResponse(response.status, await response.json()),
      ).toEqual(normal);
      expect(calls - before).toBe(1);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
  it("all unsupported methods including HEAD", async () => {
    const before = calls;
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await fetch(`${base}/analyze`, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      if (method === "HEAD") expect(await response.text()).toBe("");
      else parseAnalysisResponse(405, await response.json());
    }
    expect(calls).toBe(before);
  });
  it("invalid inputs produce contract errors and zero calls", async () => {
    const image = await imagePart();
    const before = calls;
    const cases: [Part[], number][] = [
      [[], 400],
      [[image, image], 400],
      [[image, { name: "unknown", data: "x" }], 400],
      [[image, { name: "language", data: "x", filename: "a.txt" }], 400],
      [[{ ...image, data: Buffer.alloc(0) }], 400],
      [
        [{ ...image, data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) }],
        400,
      ],
      [[{ ...image, mime: "image/gif" }], 415],
      [[{ ...image, filename: "x.jpg" }], 415],
      [[{ ...image, data: Buffer.alloc(LIMITS.imageBytes + 1) }], 413],
    ];
    for (const [parts, status] of cases) {
      const response = await post(parts);
      expect(response.status).toBe(status);
      parseAnalysisResponse(status, await response.json());
    }
    expect(calls).toBe(before);
  });
  it("body boundary inclusive and +1 denied", async () => {
    scenario = "normal";
    const image = await imagePart();
    const size = multipart([image]).length;
    const before = calls;
    expect((await post([image], LIMITS.bodyBytes - size)).status).toBe(200);
    expect((await post([image], LIMITS.bodyBytes - size + 1)).status).toBe(413);
    expect(calls - before).toBe(1);
  });
  it.each([
    ["insufficient", 422],
    ["refusal", 422],
    ["unknown", 200],
    ["malformed", 500],
    ["rate", 429],
    ["unavailable", 503],
  ])("Provider %s becomes %s with one call", async (name, status) => {
    scenario = String(name);
    const before = calls;
    const response = await post([await imagePart()]);
    expect(response.status).toBe(status);
    const text = await response.text();
    parseAnalysisResponse(Number(status), JSON.parse(text));
    expect(text).not.toContain("private-");
    expect(calls - before).toBe(1);
    if (status === 429) expect(response.headers.get("retry-after")).toBe("25");
  });
  it("application telemetry does not contain private provider output", () => {
    expect(serverLog).not.toMatch(
      /private-provider-error|private-refusal|目前可讀內容|stub-only/,
    );
  });
});
