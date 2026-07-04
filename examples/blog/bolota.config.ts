/**
 * Configuration de l'exemple de blog Bolota.
 * Ce fichier est chargé automatiquement par `src/config.ts` via `loadConfig()`.
 */

import type { BolotaConfig } from "../../src/core/config.ts";

const config: BolotaConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

export default config;
