import { prisma } from "../db.js";
import { notFound } from "../errors.js";

export function calculateBilledPlatformUnits(actualNovelAiAnlas: number, multiplier: number) {
  return Math.ceil(actualNovelAiAnlas * multiplier);
}

export async function getPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", anlasMultiplier: 1.5 },
    update: {},
  });
}

export async function grantPlatformUnits(userId: string, platformUnits: number, createdByUserId: string) {
  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { id: userId } });
    if (!existingUser) throw notFound("User not found");

    const user = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: platformUnits } },
    });

    return tx.ledgerEntry.create({
      data: {
        userId,
        type: "ADMIN_GRANT",
        platformUnits,
        balanceAfter: user.balance,
        createdByUserId,
      },
    });
  });
}

export async function debitGenerationCost(input: {
  userId: string;
  generationJobId: string;
  actualNovelAiAnlas: number;
  multiplier: number;
}) {
  const billedPlatformUnits = calculateBilledPlatformUnits(input.actualNovelAiAnlas, input.multiplier);

  const ledgerEntry = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: input.userId },
      data: { balance: { decrement: billedPlatformUnits } },
    });

    return tx.ledgerEntry.create({
      data: {
        userId: input.userId,
        generationJobId: input.generationJobId,
        type: "GENERATION_DEBIT",
        novelAiAnlas: input.actualNovelAiAnlas,
        multiplier: input.multiplier,
        platformUnits: -billedPlatformUnits,
        balanceAfter: user.balance,
      },
    });
  });

  return { billedPlatformUnits, ledgerEntry };
}
