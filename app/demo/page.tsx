import { AnalysisWorkspace } from "@/components/analysis/AnalysisWorkspace";
import { getPublicSiteConfig } from "@/lib/server/public-config";

export const dynamic = "force-dynamic";

export default function Demo() {
  return (
    <AnalysisWorkspace
      initialMode="mock"
      timeoutMs={25_000}
      feedbackConfig={getPublicSiteConfig()}
    />
  );
}
