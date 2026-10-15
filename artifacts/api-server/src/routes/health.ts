import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { connectMongo, isMongoConfigured } from "../lib/mongo";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  let status = "degraded";
  if (isMongoConfigured()) {
    try {
      await connectMongo();
      status = "ok";
    } catch {
      status = "degraded";
    }
  }
  const data = HealthCheckResponse.parse({ status });
  res.json(data);
});

export default router;
