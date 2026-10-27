import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 先方向けガイド(public/guide/index.html)を /guide で開けるようにする
  async redirects() {
    return [{ source: "/guide", destination: "/guide/index.html", permanent: false }];
  },
};

export default nextConfig;
