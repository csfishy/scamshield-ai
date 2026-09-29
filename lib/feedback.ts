/** Public allowlist only. Never pass analysis bodies, images, IPs or credentials here. */
export type FeedbackConfig = {
  formUrl?: string;
  requestIdEntry?: string;
  buildEntry?: string;
  typeEntry?: string;
  contactEmail?: string;
  buildId?: string;
  configurationIssues?: string[];
};

export type FeedbackType = "判斷可能有誤" | "操作問題" | "功能建議" | "其他";

export function validRequestId(
  value: string | null | undefined,
): string | undefined {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : undefined;
}

export function validBuildId(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9][A-Za-z0-9._+/-]{0,79}$/.test(value)
    ? value
    : undefined;
}

export function validEntryId(value: string | undefined): string | undefined {
  return value && /^entry\.[0-9]{1,20}$/.test(value) ? value : undefined;
}

export function validFormUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2048 || /[\s\\]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return undefined;
    const isLong =
      url.hostname === "docs.google.com" &&
      /^\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform$/.test(
        url.pathname,
      );
    const isShort =
      url.hostname === "forms.gle" && /^\/[A-Za-z0-9_-]+$/.test(url.pathname);
    return isLong || isShort ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function validContactEmail(
  value: string | undefined,
): string | undefined {
  if (!value || value.length > 254) return undefined;
  // A single mailbox; no header delimiters, display names, percent escapes or lists.
  return /^[A-Za-z0-9.!#$&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
    value,
  ) &&
    !value.startsWith(".") &&
    !value.includes("..") &&
    !value.split("@")[0].endsWith(".")
    ? value
    : undefined;
}

export function buildFeedbackUrl(
  config: FeedbackConfig,
  requestId?: string,
  type: FeedbackType = "其他",
): string | undefined {
  const valid = validFormUrl(config.formUrl);
  if (!valid) return undefined;
  const url = new URL(valid);
  if (url.hostname === "forms.gle") return url.href;
  const fields = [
    [validEntryId(config.requestIdEntry), validRequestId(requestId)],
    [validEntryId(config.buildEntry), validBuildId(config.buildId)],
    [validEntryId(config.typeEntry), type],
  ];
  for (const [key, value] of fields) {
    if (!key) continue;
    url.searchParams.delete(key);
    if (value) url.searchParams.set(key, value);
  }
  return url.href;
}

export function buildFeedbackMailto(
  email: string | undefined,
  requestId?: string,
): string | undefined {
  const valid = validContactEmail(email);
  if (!valid) return undefined;
  const id = validRequestId(requestId);
  const subject = `ScamShield AI 意見回饋${id ? ` [${id}]` : ""}`;
  return `mailto:${encodeURIComponent(valid)}?subject=${encodeURIComponent(subject)}`;
}
