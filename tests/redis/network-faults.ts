import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { ACQUIRE_SCRIPT } from "../../lib/server/quota-scripts";
import { createQuotaService } from "../../lib/server/quota";
import type { QuotaConfig } from "../../lib/server/quota-config";
import { createAnalyzeHandler } from "../../lib/server/analyze";
import {
  MODEL,
  PROMPT_VERSION,
  type ServerConfig,
} from "../../lib/server/config";
import { parseAnalysisResponse } from "../../lib/contracts/analysis";
import type { AnalysisEvent } from "../../lib/server/telemetry";
import { png, request } from "../helpers/images";
import type { RedisCommand } from "./support";

export type NetworkFault = "connection_reset" | "response_timeout";

/** Real HTTP fault injection on loopback, only AFTER the guarded Redis command resolves. */
export async function startFaultProxy(
  command: RedisCommand,
  fault: NetworkFault,
) {
  const token = randomUUID();
  const pending = new Set<Promise<void>>();
  let acquisition: { keys: string[]; args: string[] } | undefined;
  let completedAcquisitions = 0,
    closePromise: Promise<void> | undefined;
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (
      req.method !== "POST" ||
      req.url !== "/" ||
      req.headers.authorization !== `Bearer ${token}`
    ) {
      res.writeHead(404).end();
      return;
    }
    req.setTimeout(5000, () => req.destroy());
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += chunk.length;
      if (size > 65536) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const decoded: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !Array.isArray(decoded) ||
      decoded.length > 64 ||
      decoded[0] !== "EVAL" ||
      !decoded.every(
        (part) =>
          typeof part === "string" ||
          (typeof part === "number" && Number.isSafeInteger(part)),
      )
    ) {
      res.writeHead(400).end();
      return;
    }
    const parts = decoded.map(String);
    // The guard enforces exact scripts, random test namespaces, command cap and cleanup.
    const result = await command(parts);
    if (parts[1] === ACQUIRE_SCRIPT) {
      const length = Number(parts[2]);
      acquisition = {
        keys: parts.slice(3, 3 + length),
        args: parts.slice(3 + length),
      };
      completedAcquisitions++;
      if (fault === "connection_reset") {
        res.destroy();
        return;
      }
      // Keep the actual response pending until the application aborts its fetch.
      // The fallback only bounds teardown if a broken client never aborts.
      if (res.destroyed) return;
      const timer = setTimeout(() => res.destroy(), 5000);
      res.once("close", () => clearTimeout(timer));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ result }));
  };
  const server = createServer((req, res) => {
    const work = handle(req, res).catch(() => {
      res.destroy();
    });
    pending.add(work);
    void work.finally(() => pending.delete(work));
  });
  server.keepAliveTimeout = 1000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    get completedAcquisitions() {
      return completedAcquisitions;
    },
    get acquisition() {
      return acquisition;
    },
    close() {
      closePromise ??= (async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await Promise.allSettled([...pending]);
      })();
      return closePromise;
    },
  };
}

export async function verifyNetworkFault(
  config: QuotaConfig,
  command: RedisCommand,
  fault: NetworkFault,
) {
  const proxy = await startFaultProxy(command, fault);
  let providerEntries = 0;
  const events: AnalysisEvent[] = [];
  try {
    const quota = createQuotaService({
      ...config,
      redisUrl: proxy.url,
      redisToken: proxy.token,
      redisTimeoutMs: 3000,
      // This check isolates response-loss behavior from circuit state left by
      // the preceding transition checks in the same test namespace.
      circuitBreakerEnabled: false,
    });
    const handlerConfig: ServerConfig = {
      mode: "remote",
      provider: "openai",
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      apiTimeoutMs: 20000,
      providerTimeoutMs: 15000,
    };
    const handler = createAnalyzeHandler({
      config: () => handlerConfig,
      quota: () => quota,
      provider: () => ({
        analyze: async () => {
          providerEntries++;
          throw new Error("Provider tripwire");
        },
      }),
      telemetry: (event) => {
        events.push(event);
      },
    });
    const req = request(await png());
    req.headers.set(
      "x-vercel-forwarded-for",
      fault === "connection_reset" ? "203.0.113.40" : "203.0.113.41",
    );
    const response = await handler(req),
      body = parseAnalysisResponse(response.status, await response.json());
    assert.equal(response.status, 503);
    assert.equal("error" in body && body.error.code, "rate_limit_unavailable");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
    assert.equal(providerEntries, 0);
    assert.equal(events[0]?.providerEntered, false);
    assert.equal(
      events[0]?.failureKind,
      fault === "connection_reset" ? "network" : "timeout",
    );
    // Proof that this was a real executed acquire, not a simulated Redis result.
    assert.equal(proxy.completedAcquisitions, 1);
    const acquisition = proxy.acquisition;
    assert(acquisition);
    assert.equal(await command(["HGET", acquisition.keys[1], "count"]), "0");
    assert.equal(
      await command(["HGET", acquisition.keys[6], "state"]),
      "acquired",
    );
    assert.notEqual(
      await command(["ZSCORE", acquisition.keys[5], acquisition.args[0]]),
      null,
    );
    assert.notEqual(
      await command(["ZSCORE", acquisition.keys[2], acquisition.args[0]]),
      null,
    );
  } finally {
    await proxy.close();
  }
}
