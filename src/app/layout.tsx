import type { Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import "./globals.css";

export const metadata = {
  title: "つづきコマ",
  description: "みんなで描く連載漫画。1ページずつ候補を描いて、スワイプで評価し、一番人気がそのページになる。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f2f7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider>
          <div className="app">
            <Header />
            <main className="app-main">{children}</main>
            <TabBar />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
