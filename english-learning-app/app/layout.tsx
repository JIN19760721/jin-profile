import type { Metadata, Viewport } from "next";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "英会話マスター",
  description: "日常英会話を楽しく学べるPWAアプリ",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "英会話",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6366f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
