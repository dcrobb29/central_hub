import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Azure run-from-package mounts the deployment directory read-only.
    maximumDiskCacheSize: 0,
  },
};

export default nextConfig;
