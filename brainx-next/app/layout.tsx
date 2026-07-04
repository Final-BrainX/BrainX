import type { Metadata } from "next";
import Script from "next/script";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { BrainXProvider } from "@/components/brainx-provider";
import { ToastStack } from "@/components/brainx-ui";
import { TutorialProvider } from "@/components/tutorial-provider";

export const metadata: Metadata = {
  title: "BrainX",
  description: "AI 기반 지식 관리 플랫폼",
  icons: {
    icon: "/favicon.ico"
  }
};

const themeScript = `(() => {
  try {
    const readStoredValue = (area, key) => {
      if (window.brainxDesktop?.getStoredValue) {
        return window.brainxDesktop.getStoredValue(area, key);
      }
      return area === 'local' ? localStorage.getItem(key) : sessionStorage.getItem(key);
    };
    const preference = readStoredValue('local', 'brainx_theme_v1') || 'light';
    const theme = preference === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : preference;
    const language = readStoredValue('local', 'brainx_language_v1') || 'ko';
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    document.documentElement.lang = language;
  } catch (error) {}
})();`;

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const fontVariables = {
    "--font-display": "\"Segoe UI\", \"Pretendard\", \"Apple SD Gothic Neo\", sans-serif",
    "--font-mono": "\"Cascadia Code\", \"JetBrains Mono\", \"D2Coding\", ui-monospace, monospace",
  } as CSSProperties;

  return (
    <html lang="ko" suppressHydrationWarning style={fontVariables}>
      <body suppressHydrationWarning className="min-h-screen overflow-x-hidden bg-bg text-txt antialiased text-[14px]">
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
            <TutorialProvider>
              {children}
            </TutorialProvider>
            <ToastStack />
          </BrainXProvider>
        </div>
      </body>
    </html>
  );
}
