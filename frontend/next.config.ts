import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "export",
  images: {
    unoptimized: true, // 静的書き出しでは必須
  },
};

export default nextConfig;