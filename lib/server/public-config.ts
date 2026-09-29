import "server-only";
import {
  validBuildId,
  validContactEmail,
  validEntryId,
  validFormUrl,
  type FeedbackConfig,
} from "../feedback";

export function getPublicSiteConfig(
  env: Record<string, string | undefined> = process.env,
): FeedbackConfig {
  const issues: string[] = [];
  const read = (
    name: string,
    validator: (value: string | undefined) => string | undefined,
  ) => {
    const raw = env[name];
    const value = validator(raw);
    if (raw && !value) issues.push(name);
    return value;
  };
  const config: FeedbackConfig = {
    formUrl: read("FEEDBACK_FORM_URL", validFormUrl),
    requestIdEntry: read("FEEDBACK_FORM_ENTRY_REQUEST_ID", validEntryId),
    buildEntry: read("FEEDBACK_FORM_ENTRY_BUILD", validEntryId),
    typeEntry: read("FEEDBACK_FORM_ENTRY_TYPE", validEntryId),
    contactEmail: read("FEEDBACK_CONTACT_EMAIL", validContactEmail),
    buildId:
      read("APP_BUILD_ID", validBuildId) ??
      validBuildId(env.VERCEL_GIT_COMMIT_SHA),
  };
  const entryNames = ["requestIdEntry", "buildEntry", "typeEntry"] as const;
  const entries = entryNames.map((key) => config[key]).filter(Boolean);
  if (new Set(entries).size !== entries.length) {
    for (const key of entryNames) config[key] = undefined;
    issues.push("FEEDBACK_FORM_ENTRY_* (duplicate IDs)");
  }
  // Diagnostics disclose names only, and only in local development.
  if (env.NODE_ENV === "development") config.configurationIssues = issues;
  return config;
}
