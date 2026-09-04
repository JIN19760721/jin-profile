import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 はネイティブモジュールなのでバンドルせず Node.js から直接使用する
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
