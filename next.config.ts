import type { NextConfig } from "next";

const config: NextConfig = {
  // youtubei.js does its own runtime evaluation; keep it out of the server bundle.
  serverExternalPackages: ["youtubei.js"],
  // The dev badge sits on top of the player's bar. Errors still show.
  devIndicators: false,
};

export default config;
