import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Health Quiz · BMI 健康评估",
  description: "几步快速测评，算出你的 BMI、每日建议热量与专属目标计划。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
