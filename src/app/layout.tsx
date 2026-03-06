import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learner — Self-Evolving AI Trading System",
  description: "AI-powered algorithmic trading system that discovers, learns, and evolves its own strategies for Binance Futures.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
