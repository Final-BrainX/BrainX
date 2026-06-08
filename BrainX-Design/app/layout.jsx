import "./globals.css";

export const metadata = {
  title: "BrainX",
  description: "BrainX knowledge graph prototype"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
