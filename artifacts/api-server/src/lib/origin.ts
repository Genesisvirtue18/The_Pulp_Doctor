interface OriginConfig {
  appOrigin?: string;
  developmentOrigins?: string;
  nodeEnv?: string;
}

const productionOrigin = "https://the-pulp-doctor.vercel.app";

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export function getAllowedOrigins(
  config: OriginConfig = {
    appOrigin: process.env.APP_ORIGIN,
    developmentOrigins: process.env.DEV_FRONTEND_ORIGINS,
    nodeEnv: process.env.NODE_ENV,
  },
): string[] {
  const origins = (config.appOrigin ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  // Keep the production frontend allowed even if the Render environment value
  // is missing or includes a trailing slash.
  origins.push(productionOrigin);

  if (config.nodeEnv === "development") {
    origins.push(
      ...(config.developmentOrigins ?? "")
        .split(",")
        .map(normalizeOrigin)
        .filter(Boolean),
    );
  }

  return [...new Set(origins)];
}
