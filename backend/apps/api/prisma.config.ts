import { defineConfig, env } from "prisma/config";
import { loadRootEnv } from "./src/loadRootEnv.js";

loadRootEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
