import {
  AnalysisWorkspace,
  type AnalysisMode,
} from "@/components/analysis/AnalysisWorkspace";
import { getPublicSiteConfig } from "@/lib/server/public-config";

export const dynamic = "force-dynamic";

function publicAnalysisMode(): AnalysisMode {
  const value = process.env.ANALYSIS_MODE ?? "mock";
  if (value !== "mock" && value !== "remote") {
    throw new Error("ANALYSIS_MODE must be mock or remote");
  }
  return value;
}

export default function Home() {
  return (
    <AnalysisWorkspace
      initialMode={publicAnalysisMode()}
      timeoutMs={25_000}
      feedbackConfig={getPublicSiteConfig()}
      showDemoLink={false}
      showModeNotice={false}
      isHomepage
    />
  );
}
