// Build config for the NATIVE ANDROID APP ONLY. The web deploy (Lovable /
// Cloudflare) continues to use vite.config.ts unchanged — this file
// produces a separate, fully static, server-free build that gets bundled
// directly into the APK so the app can open with zero network connection.
//
// Run with:  npx vite build --config vite.mobile.config.ts
// Output:    dist-mobile/  (see capacitor.config.ts, webDir points here)
//
// Key differences from the web build:
//  - nitro: false          -> no server bundle, no Cloudflare worker output
//  - tanstackStart.spa     -> prerenders a static index.html shell that
//                             hydrates entirely client-side, no server
//                             needed at runtime
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  vite: {
    preview: {
      host: "127.0.0.1",
    },
  },
  tanstackStart: {
    spa: {
      enabled: true,
      // Every client-side route falls back to this same shell — Capacitor
      // loads one static index.html and the app router takes over from
      // there, same as any other SPA.
      maskPath: "/",
      prerender: {
        enabled: true,
        // Names the output file. "index" -> dist/client/index.html, which
        // is what Capacitor's webDir expects to find by default.
        outputPath: "index",
      },
    },
  },
});
