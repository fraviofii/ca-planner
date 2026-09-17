import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app de desktop empacotado roda este servidor sozinho, sem node_modules ao lado:
  // "standalone" junta o servidor e só as dependências que ele realmente usa.
  output: "standalone",

  // Prisma e ExcelJS rodam como pacotes externos no servidor (não empacotar no bundle).
  serverExternalPackages: ["@prisma/client", "prisma", "exceljs"],

  // Categorias e conexões viraram subitens de Configurações; os endereços antigos seguem valendo.
  async redirects() {
    return [
      { source: "/categorias", destination: "/configuracoes/categorias", permanent: false },
      { source: "/conexoes", destination: "/configuracoes/conexoes", permanent: false },
    ];
  },
};

export default nextConfig;
