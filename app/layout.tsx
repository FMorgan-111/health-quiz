import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Health Quiz · 每日健康测评",
  description: "8 步快速测评，了解你的身体、心理与睡眠健康。",
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
