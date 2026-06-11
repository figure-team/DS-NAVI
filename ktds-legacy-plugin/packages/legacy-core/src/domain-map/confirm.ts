import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  CONFIRMED_PLAN_FILENAME,
  ConfirmedPlanSchema,
  type CandidatesReport,
  type ConfirmedPlan,
} from "./types.js";
import { specMapDir, writeMapArtifact } from "./persist.js";

// S7 ✋확정 게이트 (Stage-16, task 16.5) — 순수 로직.
// 자동 도메인 경계는 전문가 일치율 상한이 낮아(MoJoFM ~56%) 사람 게이트를
// 생략할 수 없다(ADR §1.3). 결정은 domain-plan.confirmed.json으로 영속되어
// 재실행의 결정론 닻이 된다. CLI/호스트는 이 모듈의 순수 함수만 조합한다 —
// 비-TTY에서 임의 전체 확정 금지는 Stage-12f 패턴(호출측 책임)을 따른다.

/** 후보를 그대로 수용하는 플랜 — --auto-approve 및 인터랙티브 세션의 시작점. */
export function buildAutoPlan(
  candidates: CandidatesReport,
  decidedBy: string,
): ConfirmedPlan {
  return {
    schemaVersion: 1,
    gitCommit: candidates.gitCommit,
    decidedBy,
    domains: candidates.candidates.map((c) => ({
      key: c.key,
      name: c.key,
      roots: [...c.roots],
      aliasKeys: [],
    })),
    excludedKeys: [],
  };
}

/** 개명 — 표시명만 바꾼다 (key는 skeleton ID의 닻이라 불변). */
export function renameDomain(
  plan: ConfirmedPlan,
  key: string,
  name: string,
): ConfirmedPlan {
  const domain = plan.domains.find((d) => d.key === key);
  if (!domain) throw new Error(`unknown domain key: "${key}"`);
  return {
    ...plan,
    domains: plan.domains.map((d) => (d.key === key ? { ...d, name } : d)),
  };
}

/** 병합 — from의 루트를 into로 흡수, from key는 alias로 보존(신호 귀속 추적). */
export function mergeDomains(
  plan: ConfirmedPlan,
  fromKey: string,
  intoKey: string,
): ConfirmedPlan {
  if (fromKey === intoKey) throw new Error("cannot merge a domain into itself");
  const from = plan.domains.find((d) => d.key === fromKey);
  const into = plan.domains.find((d) => d.key === intoKey);
  if (!from) throw new Error(`unknown domain key: "${fromKey}"`);
  if (!into) throw new Error(`unknown domain key: "${intoKey}"`);
  return {
    ...plan,
    domains: plan.domains
      .filter((d) => d.key !== fromKey)
      .map((d) =>
        d.key === intoKey
          ? {
              ...d,
              roots: [...new Set([...d.roots, ...from.roots])].sort(),
              aliasKeys: [...new Set([...d.aliasKeys, fromKey, ...from.aliasKeys])].sort(),
            }
          : d,
      ),
  };
}

/**
 * 분할/이동 — 루트를 다른 도메인으로 옮긴다 (sole 도달 파일이 따라간다).
 * 마지막 루트가 빠진 도메인은 사라지며 그 도메인의 aliasKeys도 함께
 * 버려진다 — alias로 귀속되던 디렉토리/prefix 파일은 다음 스캔에서 자기
 * 신호대로 재배정되거나 미해소 큐로 간다 (skeleton은 매번 재계산).
 */
export function moveRoot(
  plan: ConfirmedPlan,
  root: string,
  intoKey: string,
): ConfirmedPlan {
  const owner = plan.domains.find((d) => d.roots.includes(root));
  if (!owner) throw new Error(`root not in any domain: "${root}"`);
  if (!plan.domains.some((d) => d.key === intoKey)) {
    throw new Error(`unknown domain key: "${intoKey}"`);
  }
  return {
    ...plan,
    domains: plan.domains
      .map((d) => ({
        ...d,
        roots:
          d.key === intoKey
            ? [...new Set([...d.roots, root])].sort()
            : d.roots.filter((r) => r !== root),
      }))
      // 루트가 다 빠진 도메인은 사라진다 (빈 도메인은 skeleton에서 무의미)
      .filter((d) => d.roots.length > 0),
  };
}

/** 제외 — 후보를 도메인에서 빼고 excludedKeys에 기록 (감사 추적). */
export function excludeDomain(plan: ConfirmedPlan, key: string): ConfirmedPlan {
  if (!plan.domains.some((d) => d.key === key)) {
    throw new Error(`unknown domain key: "${key}"`);
  }
  return {
    ...plan,
    domains: plan.domains.filter((d) => d.key !== key),
    excludedKeys: [...new Set([...plan.excludedKeys, key])].sort(),
  };
}

/**
 * 드리프트 감지 — confirmed 이후 코드가 변해 후보가 달라진 경우.
 * missingRoots: 플랜이 알지만 현재 후보에 없는 루트 (삭제/이동됨)
 * newRoots: 현재 후보에 새로 생겼지만 플랜이 모르는 루트 (재확정 필요 신호)
 */
export function detectPlanDrift(
  plan: ConfirmedPlan,
  candidates: CandidatesReport,
): { missingRoots: string[]; newRoots: string[] } {
  const candidateRoots = new Set(
    candidates.candidates.flatMap((c) => c.roots),
  );
  const planRoots = new Set(plan.domains.flatMap((d) => d.roots));
  return {
    missingRoots: [...planRoots].filter((r) => !candidateRoots.has(r)).sort(),
    newRoots: [...candidateRoots].filter((r) => !planRoots.has(r)).sort(),
  };
}

/** 게이트 제시용 후보 표 (CLI/호스트가 그대로 출력). */
export function planTable(candidates: CandidatesReport): string {
  const lines: string[] = [];
  lines.push("도메인 후보 (key | 루트 | 엔트리 | 파일수)");
  for (const c of candidates.candidates) {
    lines.push(
      `  ${c.key} | ${c.roots.map((r) => r.split("/").pop()).join(", ")} | ${c.entryCount} | ${c.files.length + c.roots.length}`,
    );
  }
  lines.push(`  common(공용) ${candidates.common.length}건 | 모호 ${candidates.ambiguous.length}건 | 미해소 ${candidates.unresolved.length}건`);
  if (candidates.ambiguous.length > 0) {
    lines.push("  모호 목록 (도달성 vs 디렉토리):");
    for (const a of candidates.ambiguous) {
      lines.push(`    ${a.relPath} — reach=${a.reachKey} / dir=${a.directoryKey}`);
    }
  }
  return lines.join("\n");
}

export async function readConfirmedPlan(
  projectRoot: string,
): Promise<ConfirmedPlan | null> {
  const file = path.join(specMapDir(projectRoot), CONFIRMED_PLAN_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err; // fail-closed: 권한/IO 오류를 "미확정"으로 오인하지 않는다
  }
  return ConfirmedPlanSchema.parse(JSON.parse(raw));
}

export async function writeConfirmedPlan(
  projectRoot: string,
  plan: ConfirmedPlan,
): Promise<string> {
  return writeMapArtifact(projectRoot, CONFIRMED_PLAN_FILENAME, ConfirmedPlanSchema.parse(plan));
}
