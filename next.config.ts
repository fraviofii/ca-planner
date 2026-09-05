import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma precisa rodar como pacote externo no servidor (não empacotar no bundle).
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
