import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { narrativePrisma?: PrismaClient };

export const db = globalForPrisma.narrativePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.narrativePrisma = db;
