import type { NextConfig } from "next";

const config: NextConfig = {
  // youtubei.js does its own runtime evaluation; keep it out of the server bundle.
  serverExternalPackages: ["youtubei.js"],
};

export default config;
