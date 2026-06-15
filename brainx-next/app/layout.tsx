import type { Metadata } from "next";
import Script from "next/script";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { BrainXProvider } from "@/components/brainx-provider";
import { ToastStack } from "@/components/brainx-ui";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "BrainX",
  description: "AI 기반 지식 관리 플랫폼"
};

const themeScript = `(() => {
  try {
    const theme = localStorage.getItem('brainx_theme_v1') || 'dark';
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (error) {}
})();`;

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${display.variable} ${mono.variable} dark`}>
      <body className="min-h-screen overflow-x-hidden bg-bg text-txt antialiased">
        <Script id="brainx-theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <div className="aurora pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <b />
          <b />
          <b />
        </div>
        <div className="relative z-10 min-h-screen">
          <BrainXProvider>
            {children}
            <ToastStack />
          </BrainXProvider>
        </div>
      </body>
    </html>
  );
}
