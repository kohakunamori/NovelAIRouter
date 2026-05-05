import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));

export const apiRootDir = findApiRootDir(sourceDir);

export function resolveApiPath(...segments: string[]) {
  return path.resolve(apiRootDir, ...segments);
}

function findApiRootDir(startDir: string) {
  let current = startDir;

  while (true) {
    if (isApiPackageRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return getFallbackApiRootDir(sourceDir);
    }
    current = parent;
  }
}

function isApiPackageRoot(directory: string) {
  return path.basename(directory) !== "dist" && existsSync(path.join(directory, "package.json")) && existsSync(path.join(directory, "prisma"));
}

function getFallbackApiRootDir(directory: string) {
  const resolvedDirectory = path.resolve(directory);
  const segments = resolvedDirectory.split(path.sep);
  const distSegmentIndex = segments.lastIndexOf("dist");
  if (distSegmentIndex > 0) {
    const distDirectory = segments.slice(0, distSegmentIndex + 1).join(path.sep);
    return path.dirname(distDirectory);
  }

  return path.resolve(directory, "..");
}
