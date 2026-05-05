import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { loadRootEnv } from "../src/loadRootEnv.js";

loadRootEnv();
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();

const defaultRules = [
  { id: "default-model", field: "model", action: "default", value: "nai-diffusion-4-5-curated" },
  { id: "default-width", field: "width", action: "default", value: 1024 },
  { id: "default-height", field: "height", action: "default", value: 1024 },
  { id: "default-steps", field: "steps", action: "default", value: 28 },
  { id: "default-scale", field: "scale", action: "default", value: 5 },
  { id: "default-sampler", field: "sampler", action: "default", value: "k_euler_ancestral" },
  { id: "limit-width", field: "width", action: "clamp", min: 512, max: 1536 },
  { id: "limit-height", field: "height", action: "clamp", min: 512, max: 1536 },
  { id: "limit-steps", field: "steps", action: "clamp", min: 1, max: 40 },
  { id: "limit-scale", field: "scale", action: "clamp", min: 1, max: 12 },
];

async function main() {
  await prisma.platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", anlasMultiplier: 1.5 },
    update: {},
  });

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  let adminId: string | undefined;

  if (adminEmail && adminPassword) {
    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      create: {
        email: adminEmail.toLowerCase(),
        passwordHash: await hashPassword(adminPassword),
        role: UserRole.ADMIN,
      },
      update: { role: UserRole.ADMIN },
    });
    adminId = admin.id;
  }

  const existingPolicy = await prisma.parameterPolicy.findFirst({
    where: { scope: "GLOBAL", name: "Default global generation limits" },
  });

  if (!existingPolicy) {
    await prisma.parameterPolicy.create({
      data: {
        name: "Default global generation limits",
        scope: "GLOBAL",
        priority: 0,
        enabled: true,
        rulesJson: defaultRules as Prisma.InputJsonValue,
        version: 1,
        createdByUserId: adminId ?? null,
      },
    });
  }
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
