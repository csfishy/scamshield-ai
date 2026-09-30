import type { QuotaService } from "../../lib/server/quota";

// Application-flow test double only. This makes no atomicity/Redis claim.
export function allowedQuota(): QuotaService {
  return {
    async preflight() {
      return {
        async acquire() {
          return {
            circuitState: "closed" as const,
            async finalize() {
              return "none" as const;
            },
            async release() {},
          };
        },
        async assertEnabled() {},
      };
    },
  };
}
