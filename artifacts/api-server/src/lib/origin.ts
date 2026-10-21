interface OriginConfig {
  appOrigin?: string;
  developmentOrigins?: string;
  nodeEnv?: string;
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
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (config.nodeEnv === "development") {
    origins.push(
      ...(config.developmentOrigins ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  return [...new Set(origins)];
}
