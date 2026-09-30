import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("anonymous device identity", () => {
  it("creates one random UUID and persists it in localStorage", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const { anonymousDeviceId, deviceIdStorageKey } =
      await import("../../lib/client/device-id");
    const first = anonymousDeviceId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(values.get(deviceIdStorageKey)).toBe(first);
    expect(anonymousDeviceId()).toBe(first);
  });

  it("uses a page-session UUID when storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("blocked");
      },
      setItem: () => {
        throw new DOMException("blocked");
      },
    });
    const { anonymousDeviceId } = await import("../../lib/client/device-id");
    expect(anonymousDeviceId()).toBe(anonymousDeviceId());
  });
});
