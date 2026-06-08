import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, defaultConfig, scaffoldSpecDir, ConfigSchema } from "./index.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ktds-config-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("defaultConfig", () => {
  it("returns expected defaults", () => {
    const cfg = defaultConfig();
    expect(cfg.networkType).toBe(3);
    expect(cfg.outputLanguage).toBe("ko");
    expect(cfg.inferredRatioWarnThreshold).toBe(0.3);
    expect(cfg.inferredRatioBlockThreshold).toBe(0.6);
    expect(cfg.supportedSchemaVersions).toEqual(["1.0.0"]);
    expect(cfg.relayBlock).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("returns defaults when config file is absent", async () => {
    const cfg = await loadConfig(dir);
    expect(cfg).toEqual(defaultConfig());
  });

  it("merges partial overrides with defaults", async () => {
    const override = { outputLanguage: "en", networkType: 5 };
    await (await import("node:fs/promises")).writeFile(
      join(dir, "understanding.config.json"),
      JSON.stringify(override),
      "utf-8"
    );
    const cfg = await loadConfig(dir);
    expect(cfg.outputLanguage).toBe("en");
    expect(cfg.networkType).toBe(5);
    expect(cfg.inferredRatioWarnThreshold).toBe(0.3);
  });

  it("parses full config with all fields", async () => {
    const full = {
      networkType: 7,
      outputLanguage: "ja",
      inferredRatioWarnThreshold: 0.2,
      inferredRatioBlockThreshold: 0.5,
      supportedSchemaVersions: ["1.0.0", "1.1.0"],
    };
    await (await import("node:fs/promises")).writeFile(
      join(dir, "understanding.config.json"),
      JSON.stringify(full),
      "utf-8"
    );
    const cfg = await loadConfig(dir);
    expect(cfg).toMatchObject(full);
  });

  it("rejects invalid threshold values", async () => {
    const bad = { inferredRatioWarnThreshold: 1.5 };
    await (await import("node:fs/promises")).writeFile(
      join(dir, "understanding.config.json"),
      JSON.stringify(bad),
      "utf-8"
    );
    await expect(loadConfig(dir)).rejects.toThrow();
  });
});

describe("ConfigSchema", () => {
  it("accepts relayBlock as optional Phase 2 field", () => {
    const result = ConfigSchema.parse({ relayBlock: { enabled: true } });
    expect(result.relayBlock?.enabled).toBe(true);
  });
});

describe("scaffoldSpecDir", () => {
  it("creates .spec/00_MASTER.md and .spec/templates/", async () => {
    await scaffoldSpecDir(dir);
    const master = await readFile(join(dir, ".spec", "00_MASTER.md"), "utf-8");
    expect(master).toContain("MASTER");
    const stat = await import("node:fs/promises").then((fs) =>
      fs.stat(join(dir, ".spec", "templates"))
    );
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent — second call does not overwrite 00_MASTER.md", async () => {
    await scaffoldSpecDir(dir);
    await (await import("node:fs/promises")).writeFile(
      join(dir, ".spec", "00_MASTER.md"),
      "custom content",
      "utf-8"
    );
    await scaffoldSpecDir(dir);
    const content = await readFile(join(dir, ".spec", "00_MASTER.md"), "utf-8");
    expect(content).toBe("custom content");
  });
});
