import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.haider.mydaydawn",
  appName: "My Day Dawn",
  // Personal-use build: the native shell just loads the real, live,
  // Supabase-backed site. No bundled web assets, no offline mode — this
  // keeps SSR, auth redirects, and Supabase all working exactly like the
  // browser version, with zero app-side code changes required.
  webDir: "dist",
  server: {
    url: "https://my-day-dawn.lovable.app/",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
