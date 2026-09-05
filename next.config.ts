import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: { "/analyze": ["./prompts/*.md"] },
};
export default config;
