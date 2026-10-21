import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getAllowedOrigins } from "./lib/origin";

const app: Express = express();

// Render terminates public traffic at its proxy and supplies the client IP in
// X-Forwarded-For. Trust only the single proxy hop in the Render runtime so
// Express rate limiters key requests by client IP without trusting arbitrary
// forwarded headers from direct/local requests.
if (process.env.RENDER === "true") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = new Set(getAllowedOrigins());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      callback(null, Boolean(origin && allowedOrigins.has(origin)));
    },
  }),
);
app.use(express.json({
  limit: "1mb",
  verify(req, _res, buffer) {
    (req as express.Request & { rawBody?: string }).rawBody = buffer.toString();
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use("/api", router);

app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ): void => {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Unhandled API error",
    );
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "The request could not be completed." });
  },
);

export default app;
