import type { NextConfig } from "next";

// 公開ページは検索に出す。ルーム画面（参加コードが URL に載る）・購入結果・API だけ止める。
// ページ側はメタの `privatePageRobots` でも止めてあるので、ここは二重の防御（API は JSON なのでヘッダでしか止められない）。
const privatePaths = ["/r/:path*", "/billing/:path*", "/api/:path*"];

const nextConfig: NextConfig = {
  // @layertalk/shared はビルド済み JS ではなく TS ソースをそのまま配っているので、
  // Next 側でトランスパイルさせる。
  transpilePackages: ["@layertalk/shared"],
  async headers() {
    return privatePaths.map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    }));
  },
};

export default nextConfig;
