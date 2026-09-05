import { PrismaClient } from "@prisma/client";

// Em dev o Next recarrega módulos; guardamos a instância no global para não
// abrir uma conexão nova a cada hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
