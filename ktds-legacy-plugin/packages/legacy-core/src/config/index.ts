import { z } from "zod";
import { promises as fs } from "node:fs";
import * as path from "node:path";

// ── Schema ─────────────────────────────────────────────────────────────────

const RelayBlockSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .optional();

export const ConfigSchema = z.object({
  networkType: z.number().int().default(3),
  outputLanguage: z.string().default("ko"),
  inferredRatioWarnThreshold: z.number().min(0).max(1).default(0.3),
  inferredRatioBlockThreshold: z.number().min(0).max(1).default(0.6),
  supportedSchemaVersions: z.array(z.string()).default(["1.0.0"]),
  /** Phase 2 reserved: relay gating config. */
  relayBlock: RelayBlockSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

// ── Loader ─────────────────────────────────────────────────────────────────

const CONFIG_FILENAME = "understanding.config.json";

export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}

/**
 * Load understanding.config.json from the given project root.
 * Missing file is not an error — defaults apply.
 */
export async function loadConfig(projectRoot: string): Promise<Config> {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return ConfigSchema.parse(parsed);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return defaultConfig();
    }
    throw err;
  }
}

// ── .spec/ scaffold ────────────────────────────────────────────────────────

const MASTER_CONTENT = `# MASTER 문서 목록\n\n<!-- /understand-init이 생성한 .spec/ 레이아웃입니다. -->\n`;

/**
 * Create the .spec/ directory layout under projectRoot (idempotent).
 * Creates: .spec/00_MASTER.md, .spec/templates/ directory.
 */
export async function scaffoldSpecDir(projectRoot: string): Promise<void> {
  const specDir = path.join(projectRoot, ".spec");
  const templatesDir = path.join(specDir, "templates");

  await fs.mkdir(templatesDir, { recursive: true });

  const masterPath = path.join(specDir, "00_MASTER.md");
  try {
    await fs.access(masterPath);
    // already exists — idempotent, skip
  } catch {
    await fs.writeFile(masterPath, MASTER_CONTENT, "utf-8");
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}
