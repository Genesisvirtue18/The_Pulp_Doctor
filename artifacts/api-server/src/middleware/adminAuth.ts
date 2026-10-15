import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { connectMongo } from "../lib/mongo";
import { AdminUserModel } from "../models/admin";

export interface AdminIdentity {
  id: string;
  email: string;
  displayName: string;
  role: "admin";
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminIdentity;
    }
  }
}

const COOKIE_NAME = "pulp_admin_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/admin",
  maxAge: 8 * 60 * 60 * 1000,
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for administrator authentication.");
  }
  return secret;
}

export function setAdminSessionCookie(
  res: Response,
  admin: AdminIdentity,
): void {
  const token = jwt.sign(
    { sub: admin.id, role: admin.role },
    sessionSecret(),
    { algorithm: "HS256", expiresIn: "8h", issuer: "the-pulp-doctor" },
  );
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
}

export function clearAdminSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
  });
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await connectMongo();
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!token) {
      res.status(401).json({ error: "Administrator sign-in required." });
      return;
    }
    const payload = jwt.verify(token, sessionSecret(), {
      algorithms: ["HS256"],
      issuer: "the-pulp-doctor",
    });
    if (
      typeof payload !== "object" ||
      !payload.sub ||
      payload.role !== "admin"
    ) {
      res.status(401).json({ error: "Administrator session is invalid." });
      return;
    }
    const admin = await AdminUserModel.findOne({
      _id: payload.sub,
      active: true,
      role: "admin",
    });
    if (!admin) {
      res.status(401).json({ error: "Administrator session is no longer active." });
      return;
    }
    req.admin = {
      id: String(admin._id),
      email: admin.email,
      displayName: admin.displayName,
      role: "admin",
    };
    next();
  } catch {
    res.status(401).json({ error: "Administrator sign-in required." });
  }
}

export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }
  try {
    const originUrl = new URL(origin);
    const host = req.get("host");
    const configuredOrigin = process.env.APP_ORIGIN;
    if (
      (configuredOrigin && origin === configuredOrigin) ||
      (!configuredOrigin && host && originUrl.host === host)
    ) {
      next();
      return;
    }
  } catch {
    // Reject malformed Origin values below.
  }
  res.status(403).json({ error: "Cross-origin request rejected." });
}
