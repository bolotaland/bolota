/**
 * Configuration de l'exemple de blog Ignis.
 * Ce fichier est chargé automatiquement par `src/config.ts` via `loadConfig()`.
 */

import type { IgnisConfig } from "../../src/core/config.ts";

const config: IgnisConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

export default config;
