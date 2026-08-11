import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @layertalk/shared はビルド済み JS ではなく TS ソースをそのまま配っているので、
  // Next 側でトランスパイルさせる。
  transpilePackages: ["@layertalk/shared"],
};

export default nextConfig;
