import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegistration } from "@/components/pwa/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScamShield AI｜截圖防詐分析",
  description: "上傳可疑截圖，整理風險訊號、原因與建議行動。",
  applicationName: "ScamShield AI",
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "ScamShield AI",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b6e69",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
