import type { QuotaService } from "../../lib/server/quota";

// Application-flow test double only. This makes no atomicity/Redis claim.
export function allowedQuota(): QuotaService {
  return {
    async preflight() {
      return {
        async acquire() {
          return { async release() {} };
        },
        async assertEnabled() {},
      };
    },
  };
}
