import { z } from "zod";
import { loadRootEnv } from "./loadRootEnv.js";

loadRootEnv();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  STORAGE_ROOT: z.string().min(1).default(".data/storage"),
});

export const env = envSchema.parse(process.env);
