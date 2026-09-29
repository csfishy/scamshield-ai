import { describe, expect, it, vi } from "vitest";
import { runPreviewSmoke } from "../../scripts/preview-smoke";
import { AppError, errorResponse } from "../../lib/server/errors";
import { normal } from "../../fixtures/demo";

const requestId = "56c145e4-4c31-4bfc-bfd5-f3ae8853e01c";
const urlArgs = ["--url", "https://preview.example.test"];
const offArgs = [
  ...urlArgs,
  "--ai-off",
  "--expected-disabled-code",
  "analysis_disabled",
];
function methodResponse(method: string) {
  return errorResponse(
    new AppError("invalid_request"),
    requestId,
    405,
    method === "HEAD",
  );
}
function stub(
  post: () => Response = () =>
    errorResponse(new AppError("analysis_disabled"), requestId),
) {
  return vi.fn<typeof fetch>(async (_input, init) =>
    init?.method === "POST" ? post() : methodResponse(String(init?.method)),
  );
}
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}

describe("anonymous Preview AI OFF smoke", () => {
  it.each(["analysis_disabled", "provider_unavailable"] as const)(
    "requires the exact %s guard without sending images, cookies or bypass secrets",
    async (code) => {
      const fetch = stub(() => errorResponse(new AppError(code), requestId));
      const result = await runPreviewSmoke(
        [...urlArgs, "--ai-off", "--expected-disabled-code", code],
        {
          fetch,
          env: { VERCEL_AUTOMATION_BYPASS_SECRET: "unit-only-bypass-secret" },
        },
      );
      expect(result.mode).toBe("ai_off");
      expect(result.anonymousCheck).toBe(true);
      expect(result.realProviderTested).toBe(false);
      expect(result.expectedDisabledCode).toBe(code);
      expect(result.entries.map((entry) => entry.status)).toEqual([
        405, 405, 405, 503,
      ]);
      expect(result.entries[3].errorCode).toBe(code);
      expect(
        result.entries.every((entry) => entry.requestId === requestId),
      ).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(4);
      for (const [input, init] of fetch.mock.calls) {
        expect(String(input)).toBe("https://preview.example.test/analyze");
        const headers = new Headers(init?.headers);
        expect(headers.has("x-vercel-protection-bypass")).toBe(false);
        expect(headers.has("cookie")).toBe(false);
        expect(headers.has("authorization")).toBe(false);
        expect(init?.credentials).toBe("omit");
        expect(init?.redirect).toBe("manual");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        if (init?.method === "POST") {
          expect(init.body).toBe("{}");
          expect(headers.get("content-type")).toBe("application/json");
        } else expect(init?.body).toBeUndefined();
      }
      expect(JSON.stringify(result)).not.toContain("unit-only-bypass-secret");
    },
  );

  it.each(
    [
      [...urlArgs, "--ai-off"],
      [
        ...urlArgs,
        "--ai-off",
        "--expected-disabled-code",
        "rate_limit_unavailable",
      ],
      [...urlArgs, "--expected-disabled-code", "analysis_disabled"],
      [...urlArgs, "--ai-off", "--expected-disabled-code", ""],
      ["--url", "http://preview.example.test", "--ai-off"],
      ["--url", "https://user:password@preview.example.test", "--ai-off"],
    ].map((args) => ({ args })),
  )(
    "rejects incomplete or unsafe configuration before network: %j",
    async ({ args }) => {
      const fetch = stub();
      await expect(runPreviewSmoke(args, { fetch, env: {} })).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      ["--image", "approved.png"],
      ["--image", ""],
      ["--allow-paid-call"],
      ["--budget-usd", "1"],
      ["--max-calls", "1"],
      ["--authorized-by", "operator"],
    ].map((extra) => ({ extra })),
  )(
    "rejects all image or paid arguments in OFF mode: %j",
    async ({ extra }) => {
      const fetch = stub();
      await expect(
        runPreviewSmoke([...offArgs, ...extra], { fetch, env: {} }),
      ).rejects.toThrow(/cannot be combined/);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([400, 429, 500, 200])(
    "rejects status %s instead of accepting a generic unavailable response",
    async (status) => {
      const fetch = stub(() => jsonResponse(status, {}));
      await expect(
        runPreviewSmoke(offArgs, { fetch, env: {} }),
      ).rejects.toThrow(/Invalid-input gate failed/);
      expect(fetch).toHaveBeenCalledTimes(4);
    },
  );

  it.each(["provider_unavailable", "rate_limit_unavailable"] as const)(
    "does not substitute %s for the selected analysis_disabled code",
    async (code) => {
      const fetch = stub(() => errorResponse(new AppError(code), requestId));
      await expect(
        runPreviewSmoke(offArgs, { fetch, env: {} }),
      ).rejects.toThrow(/expected error-code/);
    },
  );

  it.each([
    { code: "analysis_disabled", message: "Stopped", retryable: false },
    { code: "unexpected", message: "Stopped", retryable: true },
    {
      code: "analysis_disabled",
      message: "Stopped",
      retryable: true,
      extra: 1,
    },
  ])("keeps the strict shared error contract: %j", async (error) => {
    const fetch = stub(() => jsonResponse(503, { error }));
    await expect(runPreviewSmoke(offArgs, { fetch, env: {} })).rejects.toThrow(
      /contract gate failed/,
    );
  });

  it.each([
    ["cache-control", "public, max-age=600"],
    ["cache-control", null],
    ["x-request-id", "arbitrary-client-value"],
    ["x-request-id", null],
    ["content-type", "text/html"],
    ["content-type", null],
  ])("requires safe response headers: %s=%s", async (name, value) => {
    const fetch = stub(() => {
      const response = errorResponse(
        new AppError("analysis_disabled"),
        requestId,
      );
      if (value === null) response.headers.delete(name!);
      else response.headers.set(name!, value);
      return response;
    });
    await expect(runPreviewSmoke(offArgs, { fetch, env: {} })).rejects.toThrow(
      /headers gate failed/,
    );
  });

  it("requires Request ID and no-store on HEAD too", async () => {
    const fetch = stub();
    fetch.mockImplementation(async (_input, init) => {
      const response = methodResponse(String(init?.method));
      if (init?.method === "HEAD") response.headers.delete("x-request-id");
      return response;
    });
    await expect(runPreviewSmoke(offArgs, { fetch, env: {} })).rejects.toThrow(
      /headers gate failed: HEAD/,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([302, 401, 403])(
    "fails anonymous access status %s without retry or bypass",
    async (status) => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () => new Response(null, { status }),
      );
      await expect(
        runPreviewSmoke(offArgs, {
          fetch,
          env: { VERCEL_AUTOMATION_BYPASS_SECRET: "unit-only-secret" },
        }),
      ).rejects.toThrow(/method gate failed/);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect([...new Headers(fetch.mock.calls[0][1]?.headers)]).toHaveLength(0);
    },
  );

  it("does not print response content or automatically retry network failures", async () => {
    const fetch = stub(
      () =>
        new Response("private upstream details", {
          status: 503,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": requestId,
          },
        }),
    );
    await expect(runPreviewSmoke(offArgs, { fetch, env: {} })).rejects.toThrow(
      "Preview contract gate failed: POST invalid 503",
    );
    fetch.mockClear();
    fetch.mockRejectedValue(new Error("Network unavailable"));
    await expect(runPreviewSmoke(offArgs, { fetch, env: {} })).rejects.toThrow(
      "Network unavailable",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("existing explicit paid guard and standard smoke", () => {
  it("keeps standard invalid-input smoke without submitting an image", async () => {
    const fetch = stub(() =>
      errorResponse(new AppError("invalid_request"), requestId),
    );
    const result = await runPreviewSmoke(urlArgs, { fetch, env: {} });
    expect(result.mode).toBe("standard");
    expect(result.realProviderTested).toBe(false);
    expect(result.entries[3].status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[3][1]?.body).toBe("{}");
  });

  it.each(
    [
      ["--image", "approved.png"],
      ["--allow-paid-call"],
      ["--budget-usd", "1"],
      ["--max-calls", "1"],
      ["--authorized-by", "operator"],
      [
        "--image",
        "approved.png",
        "--allow-paid-call",
        "--budget-usd",
        "0",
        "--max-calls",
        "1",
        "--authorized-by",
        "operator",
      ],
      [
        "--image",
        "approved.png",
        "--allow-paid-call",
        "--budget-usd",
        "NaN",
        "--max-calls",
        "1",
        "--authorized-by",
        "operator",
      ],
      [
        "--image",
        "approved.png",
        "--allow-paid-call",
        "--budget-usd",
        "1",
        "--max-calls",
        "2",
        "--authorized-by",
        "operator",
      ],
      [
        "--image",
        "approved.png",
        "--allow-paid-call",
        "--budget-usd",
        "1",
        "--max-calls",
        "1",
        "--authorized-by",
        " ",
      ],
    ].map((extra) => ({ extra })),
  )(
    "requires a complete explicit paid authorization before network: %j",
    async ({ extra }) => {
      const fetch = stub();
      await expect(
        runPreviewSmoke([...urlArgs, ...extra], { fetch, env: {} }),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("still rejects a budget below the existing reservation before network", async () => {
    const fetch = stub();
    await expect(
      runPreviewSmoke(
        [
          ...urlArgs,
          "--image",
          "tests/evaluation/candidates/images/normal-family-dinner.png",
          "--allow-paid-call",
          "--budget-usd",
          "0.001",
          "--max-calls",
          "1",
          "--authorized-by",
          "unit-test-operator",
        ],
        { fetch, env: {} },
      ),
    ).rejects.toThrow(/budget-usd must be at least/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits an image once only after complete explicit guards, using an offline transport", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      if (init?.body instanceof FormData) return jsonResponse(200, normal);
      if (init?.method === "POST")
        return errorResponse(new AppError("invalid_request"), requestId);
      return methodResponse(String(init?.method));
    });
    const result = await runPreviewSmoke(
      [
        ...urlArgs,
        "--image",
        "tests/evaluation/candidates/images/normal-family-dinner.png",
        "--allow-paid-call",
        "--budget-usd",
        "1",
        "--max-calls",
        "1",
        "--authorized-by",
        "unit-test-operator",
      ],
      { fetch, env: {} },
    );
    expect(result.entries).toHaveLength(5);
    expect(
      fetch.mock.calls.filter(([, init]) => init?.body instanceof FormData),
    ).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
