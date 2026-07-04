import { PrismaClient } from "@prisma/client";

// Singleton to avoid exhausting the pgbouncer pool on serverless hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
export { persistParse } from "./persistParse.js";
export type { PersistArgs } from "./persistParse.js";
export {
  buildInsightFeed, strengthVsVolume, sleepVsIntake, weekdayAdherence,
  proteinShortfall, dropSetFatigue, readinessVsPerformance,
} from "./insights.js";
export type { InsightCard } from "./insights.js";
export { lookupFood } from "./foodLookup.js";
export type { FoodMacros } from "./foodLookup.js";
