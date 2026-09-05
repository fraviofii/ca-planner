/**
 * Semeia a árvore inicial de categorias (pt-BR). Idempotente: só insere o que não existe,
 * nunca apaga ou renomeia o que o usuário já alterou.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED: Array<{ group: string; categories: string[] }> = [
  { group: "Moradia", categories: ["Aluguel / Condomínio", "Energia", "Água", "Internet / Telefone", "Manutenção"] },
  { group: "Alimentação", categories: ["Supermercado", "Restaurantes", "Delivery"] },
  { group: "Transporte", categories: ["Combustível", "Pedágio / Estacionamento", "Apps / Transporte público", "Manutenção do veículo"] },
  { group: "Saúde", categories: ["Plano de saúde", "Farmácia", "Médico / Exames"] },
  { group: "Educação", categories: ["Escola", "Cursos", "Livros"] },
  { group: "Lazer", categories: ["Viagens", "Assinaturas / Streaming", "Entretenimento"] },
  { group: "Compras", categories: ["Roupas", "Eletrônicos", "Casa"] },
  { group: "Financeiro", categories: ["Tarifas bancárias", "Juros / Empréstimos", "Impostos", "Investimentos", "Pagamento de fatura"] },
  { group: "Serviços", categories: ["Serviços profissionais", "Software / Ferramentas"] },
  { group: "Receitas", categories: ["Salário / Pró-labore", "Rendimentos", "Outras receitas"] },
  { group: "Outros", categories: ["Outros"] },
];

async function main() {
  let created = 0;
  for (const [gi, g] of SEED.entries()) {
    const group = await prisma.categoryGroup.upsert({
      where: { name: g.group },
      update: {},
      create: { name: g.group, sortOrder: gi },
    });
    for (const [ci, name] of g.categories.entries()) {
      const existing = await prisma.category.findUnique({ where: { groupId_name: { groupId: group.id, name } } });
      if (!existing) {
        await prisma.category.create({ data: { name, groupId: group.id, sortOrder: ci } });
        created++;
      }
    }
  }
  console.log(`Seed concluído: ${created} categoria(s) nova(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
