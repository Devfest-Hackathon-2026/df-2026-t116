import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画面側で手元モード（x-dev-user）か Firebase ログインかを切り替えるため、ビルド時に埋め込む
  env: {
    NEXT_PUBLIC_DATA_BACKEND: process.env.DATA_BACKEND === "firestore" ? "firestore" : "memory",
  },
  // firebase-admin はバンドルせずサーバーで require する
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
