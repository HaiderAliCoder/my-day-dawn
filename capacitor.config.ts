import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.haider.mydaydawn",
  appName: "My Day Dawn",
  // The native shell loads a locally bundled, fully static build of the
  // app (see vite.mobile.config.ts / `bun run build:mobile`) — no
  // server.url, no network required just to open the app. Data (tasks,
  // goals, etc.) still comes from Supabase over the network as before;
  // this only makes the app SHELL itself work offline. The web deploy
  // (lovable.app) is a completely separate build and is unaffected.
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
  },
};

export default config;
