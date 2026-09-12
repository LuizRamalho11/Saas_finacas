/**
 * Seed reprodutível do Finora.
 *
 * Gera ~18 meses de lançamentos reais no banco. Os KPIs e gráficos do produto
 * são agregações dessas linhas — não existe mais série sintética paralela, de
 * modo que criar ou excluir uma transação move os números de verdade.
 *
 *   npx prisma db seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { assertSeedAllowed, SeedRefused } from "../lib/server/demo";
import { CATEGORY_COLORS } from "../lib/palette";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 548; // ~18 meses: 12 meses de análise + base comparativa
const FUTURE_DAYS = 12; // lançamentos agendados à frente

const DEMO_USER = {
  name: "Luiza Andrade",
  // E-mail e senha vêm do ambiente: senha de demonstração não fica no código (F10).
  email: env.DEMO_EMAIL,
  role: "Head de Finanças",
  company: "Finora Tecnologia Ltda.",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
};

// ---------------------------------------------------------------- utilidades

/** PRNG determinístico: o mesmo seed produz sempre o mesmo banco. */
function createRandom(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, items: readonly T[]) => items[Math.floor(random() * items.length)];
const between = (random: () => number, min: number, max: number) => min + random() * (max - min);

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const TODAY = startOfToday();
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Curva sazonal anual: pico no 4º trimestre, vale em jan/fev. */
function seasonalFactor(date: Date) {
  const dayOfYear = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / DAY_MS);
  const yearly = Math.sin(((dayOfYear - 80) / 365) * Math.PI * 2) * 0.11;
  const q4 = date.getUTCMonth() >= 9 ? 0.14 : 0;
  const summerDip = date.getUTCMonth() <= 1 ? -0.12 : 0;
  return 1 + yearly + q4 + summerDip;
}

function weekdayFactor(date: Date) {
  const day = date.getUTCDay();
  if (day === 0) return 0.28;
  if (day === 6) return 0.42;
  if (day === 1) return 1.08;
  return 1;
}

/** Divide um total em `parts` fatias com proporções irregulares mas somando 1. */
function splitAmount(random: () => number, total: number, parts: number) {
  const weights = Array.from({ length: parts }, () => between(random, 0.6, 1.4));
  const sum = weights.reduce((acc, w) => acc + w, 0);
  const values = weights.map((w) => Math.round(((w / sum) * total) / 10) * 10);
  // Ajusta a última fatia para o total bater exatamente
  const drift = total - values.reduce((acc, v) => acc + v, 0);
  values[values.length - 1] = Math.max(10, values[values.length - 1] + drift);
  return values;
}

// ---------------------------------------------------------------- catálogo

const INCOME_CATEGORIES = [
  { name: "Assinaturas recorrentes", color: CATEGORY_COLORS[0].hex, icon: "repeat", weight: 0.58 },
  { name: "Serviços de implantação", color: CATEGORY_COLORS[1].hex, icon: "wrench", weight: 0.27 },
  { name: "Licenças enterprise", color: CATEGORY_COLORS[3].hex, icon: "shield", weight: 0.15 },
];

/** `daily` é a fatia da despesa corrente; folha e impostos ganham picos à parte. */
const EXPENSE_CATEGORIES = [
  { name: "Folha de pagamento", color: CATEGORY_COLORS[7].hex, icon: "users", daily: 0.2 },
  { name: "Marketing", color: CATEGORY_COLORS[4].hex, icon: "megaphone", daily: 0.22 },
  { name: "Operacional", color: CATEGORY_COLORS[6].hex, icon: "building", daily: 0.19 },
  { name: "Infraestrutura", color: CATEGORY_COLORS[2].hex, icon: "server", daily: 0.15 },
  { name: "Impostos", color: CATEGORY_COLORS[5].hex, icon: "landmark", daily: 0.06 },
  { name: "Software e ferramentas", color: CATEGORY_COLORS[8].hex, icon: "package", daily: 0.1 },
];

const ACCOUNTS = [
  { name: "Conta Principal", type: "checking", institution: "Banco Aurora", openingBalance: 420_000 },
  { name: "Reserva de Caixa", type: "savings", institution: "Banco Aurora", openingBalance: 600_000 },
  { name: "Cartão Corporativo", type: "credit_card", institution: "Cartão Vértice", openingBalance: 0 },
  { name: "Aplicações CDB", type: "investment", institution: "Meridiano Invest", openingBalance: 900_000 },
];

const CLIENTS = [
  "Núcleo Verde Alimentos",
  "Construtora Ipê Branco",
  "Clínica Vitalis",
  "Transportes Andorinha",
  "Ateliê Marés",
  "Rede Farmacore",
  "Logística Ponta Sul",
  "Editora Bom Retiro",
  "Cooperativa Serra Azul",
  "Studio Miralta",
  "Instituto Passo Certo",
  "Padaria Trigo & Cia",
];

const VENDORS: Record<string, string[]> = {
  "Folha de pagamento": ["Folha CLT", "Pró-labore sócios", "Contratos PJ", "Benefícios Vitanova"],
  Marketing: ["Agência Farol Digital", "Mídia paga Circuito", "Patrocínio Feira Vetor", "Produtora Ondar"],
  Operacional: ["Aluguel Edifício Lumen", "Coworking Praça Nova", "Facilities Zênite", "Viagens Rota Livre"],
  Infraestrutura: ["Cloud Nimbus", "CDN Halo", "Telecom Fibratec", "Datacenter Órion"],
  Impostos: ["DAS Simples Nacional", "ISS Municipal", "INSS Patronal", "IRPJ trimestral"],
  "Software e ferramentas": ["Licenças Kortex", "CRM Pinha", "Suporte Deskly", "Assinatura Gridly"],
};

const INCOME_PLANS: Record<string, string[]> = {
  "Assinaturas recorrentes": ["Plano Scale", "Plano Growth", "Plano Enterprise", "Renovação anual"],
  "Serviços de implantação": ["Implantação e onboarding", "Consultoria de dados", "Migração assistida"],
  "Licenças enterprise": ["Licença enterprise anual", "Licença multi-empresa", "Pacote de módulos"],
};

const METHODS = ["Pix", "Boleto", "TED", "Cartão corporativo", "Débito automático"];

// ---------------------------------------------------------------- seed

async function main() {
  // O seed cria um usuário de senha conhecida: nunca pode rodar sem querer
  // contra produção (F10).
  assertSeedAllowed({
    nodeEnv: env.NODE_ENV,
    appMode: env.APP_MODE,
    demoPassword: env.DEMO_PASSWORD,
    force: process.argv.includes("--force-demo"),
  });

  console.log("Limpando dados do usuário de demonstração…");
  // O cascade do schema remove contas, categorias, transações, sessões e histórico.
  await prisma.user.deleteMany({ where: { email: DEMO_USER.email } });

  const user = await prisma.user.create({
    data: {
      name: DEMO_USER.name,
      email: DEMO_USER.email,
      passwordHash: await bcrypt.hash(env.DEMO_PASSWORD!, 10),
      role: DEMO_USER.role,
      company: DEMO_USER.company,
      currency: DEMO_USER.currency,
      timezone: DEMO_USER.timezone,
    },
  });

  const accounts = await Promise.all(
    ACCOUNTS.map((account) =>
      prisma.account.create({
        data: {
          userId: user.id,
          name: account.name,
          type: account.type,
          institution: account.institution,
          openingBalance: new Prisma.Decimal(account.openingBalance),
        },
      }),
    ),
  );

  const categories = await Promise.all([
    ...INCOME_CATEGORIES.map((c) =>
      prisma.category.create({
        data: { userId: user.id, name: c.name, type: "income", color: c.color, icon: c.icon },
      }),
    ),
    ...EXPENSE_CATEGORIES.map((c) =>
      prisma.category.create({
        data: { userId: user.id, name: c.name, type: "expense", color: c.color, icon: c.icon },
      }),
    ),
  ]);

  const categoryByName = new Map(categories.map((c) => [c.name, c]));
  const accountByName = new Map(accounts.map((a) => [a.name, a]));
  const mainAccount = accountByName.get("Conta Principal")!;
  const reserveAccount = accountByName.get("Reserva de Caixa")!;
  const cardAccount = accountByName.get("Cartão Corporativo")!;

  const random = createRandom(20260908);
  const rows: Prisma.TransactionCreateManyInput[] = [];

  const pushRow = (row: Omit<Prisma.TransactionCreateManyInput, "userId">) => rows.push({ ...row, userId: user.id });

  const start = addDays(TODAY, -(HISTORY_DAYS - 1));

  for (let i = 0; i < HISTORY_DAYS + FUTURE_DAYS; i += 1) {
    const date = addDays(start, i);
    const isFuture = date.getTime() > TODAY.getTime();
    const daysFromToday = Math.round((date.getTime() - TODAY.getTime()) / DAY_MS);
    const monthsFromStart = i / 30.44;
    const trend = 34_500 * Math.pow(1.011, monthsFromStart);

    // Status: quase tudo liquidado no passado; os dias recentes e futuros ficam pendentes.
    const statusFor = () => {
      if (isFuture) return "pending";
      if (daysFromToday > -4) return random() > 0.45 ? "pending" : "completed";
      return "completed";
    };

    // ---- receita do dia
    let revenue = trend * seasonalFactor(date) * weekdayFactor(date) * between(random, 0.88, 1.14);
    if (random() > 0.975) revenue += between(random, 45_000, 180_000); // contrato enterprise
    revenue = Math.round(revenue);

    if (revenue > 0) {
      const parts = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1 : random() > 0.45 ? 2 : 1;
      for (const amount of splitAmount(random, revenue, parts)) {
        const bucket = (() => {
          const roll = random();
          if (roll < 0.58) return INCOME_CATEGORIES[0];
          if (roll < 0.85) return INCOME_CATEGORIES[1];
          return INCOME_CATEGORIES[2];
        })();
        const category = categoryByName.get(bucket.name)!;
        const client = pick(random, CLIENTS);
        const plan = pick(random, INCOME_PLANS[bucket.name]);
        pushRow({
          accountId: random() > 0.2 ? mainAccount.id : reserveAccount.id,
          categoryId: category.id,
          description: `${plan} — ${client}`,
          counterparty: client,
          amount: new Prisma.Decimal(amount),
          type: "income",
          status: statusFor(),
          method: pick(random, METHODS),
          date,
        });
      }
    }

    // ---- despesa do dia
    let expense = trend * 0.66 * seasonalFactor(date) * between(random, 0.9, 1.08);
    expense *= date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.35 : 1.05;
    expense = Math.round(expense);

    const dom = date.getUTCDate();

    // Folha quinzenal e impostos entram como lançamentos próprios
    if (dom === 5 || dom === 20) {
      const category = categoryByName.get("Folha de pagamento")!;
      pushRow({
        accountId: mainAccount.id,
        categoryId: category.id,
        description: `${pick(random, VENDORS["Folha de pagamento"])} — competência ${String(dom).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
        counterparty: "Folha de pagamento",
        amount: new Prisma.Decimal(Math.round(trend * 1.6)),
        type: "expense",
        status: statusFor(),
        method: "TED",
        date,
      });
    }

    if (dom === 20) {
      const category = categoryByName.get("Impostos")!;
      pushRow({
        accountId: mainAccount.id,
        categoryId: category.id,
        description: `${pick(random, VENDORS["Impostos"])} — apuração mensal`,
        counterparty: "Receita Federal",
        amount: new Prisma.Decimal(Math.round(trend * 1.05)),
        type: "expense",
        status: statusFor(),
        method: "Débito automático",
        date,
      });
    }

    if (expense > 0) {
      const parts = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1 : random() > 0.4 ? 2 : 1;
      for (const amount of splitAmount(random, expense, parts)) {
        // Sorteio proporcional à participação da categoria na despesa corrente
        const total = EXPENSE_CATEGORIES.reduce((acc, c) => acc + c.daily, 0);
        let roll = random() * total;
        let bucket = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
        for (const candidate of EXPENSE_CATEGORIES) {
          roll -= candidate.daily;
          if (roll <= 0) {
            bucket = candidate;
            break;
          }
        }
        const category = categoryByName.get(bucket.name)!;
        const vendor = pick(random, VENDORS[bucket.name]);
        pushRow({
          accountId: bucket.name === "Software e ferramentas" || random() > 0.75 ? cardAccount.id : mainAccount.id,
          categoryId: category.id,
          description: `${vendor} — ${bucket.name.toLowerCase()}`,
          counterparty: vendor,
          amount: new Prisma.Decimal(amount),
          type: "expense",
          status: statusFor(),
          method: pick(random, METHODS),
          date,
        });
      }
    }

    // ---- lançamentos cancelados (não entram nas agregações, mas existem no extrato)
    if (!isFuture && random() > 0.985) {
      const category = categoryByName.get("Marketing")!;
      const vendor = pick(random, VENDORS.Marketing);
      pushRow({
        accountId: cardAccount.id,
        categoryId: category.id,
        description: `${vendor} — campanha cancelada`,
        counterparty: vendor,
        amount: new Prisma.Decimal(Math.round(between(random, 4_000, 26_000) / 10) * 10),
        type: "expense",
        status: "canceled",
        method: "Cartão corporativo",
        date,
        notes: "Campanha suspensa antes da veiculação; valor estornado pelo fornecedor.",
      });
    }
  }

  console.log(`Inserindo ${rows.length} transações…`);
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.transaction.createMany({ data: rows.slice(i, i + 500) });
  }

  // Histórico de acessos de exemplo, para a tela de segurança não nascer vazia
  const devices = [
    {
      ip: "189.45.12.7",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
    },
    {
      ip: "189.45.12.7",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Version/18.2 Mobile Safari/604.1",
    },
    {
      ip: "201.17.88.140",
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
    },
  ];

  await prisma.loginHistory.createMany({
    data: devices.flatMap((device, index) => {
      const loginAt = addDays(TODAY, -(index * 2 + 1));
      return [
        {
          userId: user.id,
          email: user.email,
          loginAt,
          logoutAt: new Date(loginAt.getTime() + 3_600_000 * (index + 1)),
          ipAddress: device.ip,
          userAgent: device.ua,
          success: true,
        },
      ];
    }),
  });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      email: user.email,
      loginAt: addDays(TODAY, -3),
      ipAddress: "45.161.203.19",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/139.0 Safari/537.36",
      success: false,
      reason: "Senha incorreta",
    },
  });

  const [txCount, income, expense] = await Promise.all([
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.transaction.aggregate({
      where: { userId: user.id, type: "income", status: { not: "canceled" } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId: user.id, type: "expense", status: { not: "canceled" } },
      _sum: { amount: true },
    }),
  ]);

  const revenue = Number(income._sum.amount ?? 0);
  const cost = Number(expense._sum.amount ?? 0);

  console.log("\nSeed concluído:");
  // A senha não é impressa: ela está no seu .env (DEMO_PASSWORD).
  console.log(`  usuário      ${user.email}`);
  console.log(`  contas       ${accounts.length}`);
  console.log(`  categorias   ${categories.length}`);
  console.log(`  transações   ${txCount}`);
  console.log(`  receita      R$ ${revenue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`);
  console.log(`  despesa      R$ ${cost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`);
  console.log(`  margem       ${(((revenue - cost) / revenue) * 100).toFixed(1)}%`);
}

main()
  .catch((error) => {
    // Recusa por ambiente é decisão nossa, não defeito: mensagem limpa, sem stack.
    console.error(error instanceof SeedRefused ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
