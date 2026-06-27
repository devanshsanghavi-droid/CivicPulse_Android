// app.config.js
// Dynamic Expo config layered on top of the static app.json.
//
// Why this exists: the Android Google Maps API key must end up in the built
// AndroidManifest, but we never want the real key committed to git. So app.json
// keeps a harmless placeholder, and the real key is injected here at build time
// from the GOOGLE_MAPS_API_KEY environment variable.
//
//   • EAS cloud builds read it from the sensitive EAS env var GOOGLE_MAPS_API_KEY
//     (set per-environment, e.g. `eas env:create preview --name GOOGLE_MAPS_API_KEY`).
//   • Local builds read it from your shell (export GOOGLE_MAPS_API_KEY=... ).
//
// If the env var is absent, we fall back to whatever app.json has (the
// placeholder) so config evaluation never crashes.
module.exports = ({ config }) => {
  const mapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    config.android?.config?.googleMaps?.apiKey;

  // google-services.json is gitignored, so it isn't uploaded to EAS builders.
  // On EAS it's provided as a secret *file* env var (GOOGLE_SERVICES_JSON holds
  // the path the builder wrote it to). Locally it resolves to the repo-root file.
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile;

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: mapsApiKey,
        },
      },
    },
  };
};
