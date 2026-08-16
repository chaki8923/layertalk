import type { NextConfig } from "next";

const searchIndexingEnabled = process.env.SEARCH_INDEXING_ENABLED === "true";

const nextConfig: NextConfig = {
  // @layertalk/shared はビルド済み JS ではなく TS ソースをそのまま配っているので、
  // Next 側でトランスパイルさせる。
  transpilePackages: ["@layertalk/shared"],
  async headers() {
    if (searchIndexingEnabled) return [];

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
