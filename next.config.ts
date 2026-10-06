import type { NextConfig } from "next";

/**
 * Two builds:
 * - Normal (`npm run build`): full app with the AI route at /api/assist.
 * - Static (`npm run build:pages`, STATIC_EXPORT=1): plain files for GitHub Pages.
 *   No server, so the AI route is left out (it lives in `route.server.ts`, which only
 *   the normal build picks up) and the assistant uses its offline helpers.
 */
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev-mode "N" indicator sat on top of the sidebar's profile button. Hidden;
  // Next.js still shows compile and runtime errors when they happen.
  devIndicators: false,
  pageExtensions: isStatic ? ["tsx", "ts"] : ["tsx", "ts", "server.ts"],
  ...(isStatic && {
    output: "export",
    basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
