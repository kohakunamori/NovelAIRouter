import path from "node:path";
import { env } from "../env.js";
import { resolveApiPath } from "../paths.js";
import { DiskStorageAdapter } from "./diskStorage.js";

export const storageRoot = path.isAbsolute(env.STORAGE_ROOT)
  ? env.STORAGE_ROOT
  : resolveApiPath(env.STORAGE_ROOT);

export const legacyBuildOutputStorageRoots = path.isAbsolute(env.STORAGE_ROOT)
  ? []
  : [resolveApiPath("dist", env.STORAGE_ROOT)];

export const binaryStorage = new DiskStorageAdapter(storageRoot);
