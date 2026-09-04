import { describe, expect, it, vi } from "vitest";
import { fakeDelivery } from "../../fixtures/demo";
import {
  AnalysisClientError,
  analyzeRemoteImage,
} from "../../lib/client/analysis-service";

const file = new File([new Uint8Array([137, 80, 78, 71])], "case.png", {
  type: "image/png",
});

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

describe("client /analyze transport", () => {
  it("posts the v2 multipart fields to the same-origin route", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(input).toBe("/analyze");
        expect(init?.method).toBe("POST");
        expect(init?.cache).toBe("no-store");
        expect(init?.redirect).toBe("error");
        expect(init?.headers).toBeUndefined();
        const form = init?.body as FormData;
        expect(form.get("image")).toBe(file);
        expect(form.get("source")).toBe("screenshot");
        expect(form.get("language")).toBe("zh-TW");
        return jsonResponse(fakeDelivery);
      },
    ) as typeof fetch;

    await expect(
      analyzeRemoteImage(file, { timeoutMs: 25_000, fetcher }),
    ).resolves.toEqual(fakeDelivery);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [413, "request_too_large", false],
    [429, "rate_limited", true],
    [502, "service_unavailable", true],
    [503, "service_unavailable", true],
    [504, "service_unavailable", true],
    [401, "access_denied", false],
    [403, "access_denied", false],
  ] as const)(
    "maps platform HTML %s without claiming success",
    async (status, kind, retryable) => {
      const fetcher = vi.fn(
        async () =>
          new Response("<html>platform response</html>", {
            status,
            headers: { "content-type": "text/html", "retry-after": "30" },
          }),
      ) as unknown as typeof fetch;

      const promise = analyzeRemoteImage(file, { timeoutMs: 25_000, fetcher });
      await expect(promise).rejects.toMatchObject({ kind, retryable, status });
    },
  );

  it("preserves a valid contract error and Retry-After for manual retry", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: "provider_rate_limit",
            message: "目前請求較多，請稍後再試。",
            retryable: true,
          },
        },
        429,
        { "retry-after": "25" },
      ),
    ) as unknown as typeof fetch;

    await expect(
      analyzeRemoteImage(file, { timeoutMs: 25_000, fetcher }),
    ).rejects.toMatchObject({
      kind: "contract",
      code: "provider_rate_limit",
      retryable: true,
      retryAfter: "25",
    });
  });

  it("rejects malformed JSON and invalid success schemas", async () => {
    const malformed = vi.fn(
      async () =>
        new Response("{", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const invalidSchema = vi.fn(async () =>
      jsonResponse({ ...fakeDelivery, riskLevel: "low" }),
    ) as unknown as typeof fetch;

    for (const fetcher of [malformed, invalidSchema]) {
      const promise = analyzeRemoteImage(file, { timeoutMs: 25_000, fetcher });
      await expect(promise).rejects.toBeInstanceOf(AnalysisClientError);
      await expect(promise).rejects.toMatchObject({
        kind: "invalid_response",
        retryable: false,
      });
    }
  });

  it("distinguishes caller cancellation from network failure", async () => {
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            {
              once: true,
            },
          );
        }),
    ) as unknown as typeof fetch;
    const controller = new AbortController();
    const promise = analyzeRemoteImage(file, {
      signal: controller.signal,
      timeoutMs: 25_000,
      fetcher,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({
      kind: "cancelled",
      retryable: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("times out without automatically retrying the POST", async () => {
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("timeout")),
            {
              once: true,
            },
          );
        }),
    ) as unknown as typeof fetch;

    await expect(
      analyzeRemoteImage(file, { timeoutMs: 1, fetcher }),
    ).rejects.toMatchObject({ kind: "timeout", retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
