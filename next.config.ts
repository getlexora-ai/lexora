import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // jspdf lazily `import()`s these optional deps only for its HTML/SVG
    // rendering features, which we don't use (contract export is text-only).
    // Alias them to an empty module so Turbopack doesn't fail resolving them.
    resolveAlias: {
      canvg: "./src/lib/noop-module.js",
      dompurify: "./src/lib/noop-module.js",
      html2canvas: "./src/lib/noop-module.js",
    },
  },
};

export default nextConfig;
