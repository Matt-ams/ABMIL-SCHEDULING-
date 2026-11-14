import { bindings, defineConfig, defineWorker } from "cf/config";

const hyperdriveId = process.env.CLOUDFLARE_HYPERDRIVE_ID;

export default defineConfig({
  worker: defineWorker({
    name: "abmil-pose-workforce",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-14",
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      ...(hyperdriveId ? { HYPERDRIVE: bindings.hyperdrive({ id: hyperdriveId }) } : {}),
    },
  }),
});
