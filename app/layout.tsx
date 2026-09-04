import type { ReactNode } from "react";
export const metadata = {
  title: "ScamShield AI",
  description: "截圖詐騙風險輔助判斷",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
