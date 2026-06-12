import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DocSection, GeneratedDoc } from "../types.js";
import { renderMarkdown } from "../doc-generator/index.js";
import {
  buildChangeImpact,
  type ImpactAggregateInputs,
} from "./doc.js";
import type { ImpactVerifyReport } from "./verify.js";
import type { ImpactResult, ImpactSeed } from "./types.js";

const execFileAsync = promisify(execFile);

// T12 — /understand-review 변경분 실측 리뷰 (중간 점검 P1, ADR-002 부록 B).
// 예측(/understand-impact: "바꾸면 어디까지?")의 짝 — "실제로 바뀐 파일"을
// git(diff -z + ls-files --others: 미커밋·untracked 포함)으로 결정론 수집해
// 같은 impact 엔진에 시드로 투입한다. 산출물은 review.json/
// review-verify-report.json(impact.json=마지막 예측을 보존)과 리뷰 체크리스트,
// 그리고 diff-overlay.json(실측 채널 — "변경됨" 라벨이 진짜 의미가 되는 곳).
// --sr이면 사전 예측 보관본과 대조한다.
// 주의: 분석 시점과 git diff 시점 사이에 워킹트리가 바뀌면 미세 불일치 가능
// (단일 실행 내 짧은 창 — 한계로 수용). 커밋된 변경을 리뷰할 땐 --base 명시
// (재스캔이 census.gitCommit을 HEAD로 옮겨 기본 base가 이동하므로).

export const REVIEW_REPORT_FILENAME = "review.json";
export const REVIEW_VERIFY_FILENAME = "review-verify-report.json";
export const REVIEW_CHECKLIST_FILENAME = "change-review-checklist.md";
export const REVIEW_STATUS_LINE =
  "리뷰 체크리스트 · 읽기전용(검토·승인 상태기계 밖) · ktds /understand-review";

export class ReviewGitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewGitError";
  }
}

export interface ChangedFile {
  relPath: string;
  /** git --name-status: A(추가) M(수정) R(이름변경, relPath=새 경로). */
  status: "A" | "M" | "R";
}

export interface CollectedChanges {
  baseRef: string;
  changed: ChangedFile[];
  /** 삭제 파일 — 현재 그래프에 노드가 없어 도달성 시드가 못 됨(별도 수동 확인 절). */
  deleted: string[];
}

/**
 * base..워킹트리 변경 파일 수집 (미커밋 변경 + untracked 신규 파일 포함 —
 * PL의 머지 전 리뷰가 주 용도). git 실패(비-git, 잘못된 ref)는 ReviewGitError로
 * fail-closed. 두 가지 함정을 census.ts와 동일한 방식으로 회피한다(독립 리뷰 major):
 *   - `-z`(NUL 구분) — 기본 core.quotepath는 한글 등 비-ASCII 경로를 C-인용
 *     (8진 이스케이프)으로 출력해 시드가 census와 절대 조인되지 않는다.
 *   - `git diff`는 untracked 신규 파일을 보고하지 않는다 — `ls-files --others`로
 *     합류해 "미커밋 변경 포함" 의미를 참으로 만든다(census 인벤토리와도 일관).
 */
export async function collectChangedFiles(
  projectRoot: string,
  baseRef: string,
): Promise<CollectedChanges> {
  const run = async (args: string[]): Promise<string> => {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: projectRoot,
        maxBuffer: 64 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      const msg = (err as { stderr?: string; message?: string }).stderr || (err as Error).message;
      throw new ReviewGitError(
        `git ${args[0]} 실패 (base=${baseRef}) — git 저장소가 아니거나 ref가 유효하지 않습니다: ${String(msg).trim().split("\n")[0]}`,
      );
    }
  };

  const changed: ChangedFile[] = [];
  const deleted: string[] = [];

  // NUL 필드 순회: <status>\0<path>\0 … R/C는 <status>\0<old>\0<new>\0
  const fields = (await run(["diff", "--name-status", "-M", "-z", baseRef])).split("\0");
  let i = 0;
  while (i < fields.length) {
    const status = fields[i];
    if (!status) {
      i += 1;
      continue;
    }
    const code = status[0];
    if (code === "R" || code === "C") {
      const oldPath = fields[i + 1];
      const newPath = fields[i + 2];
      i += 3;
      if (code === "R") {
        if (newPath) changed.push({ relPath: newPath, status: "R" });
        if (oldPath) deleted.push(oldPath); // 옛 경로는 그래프에서 사라짐
      } else if (newPath) {
        changed.push({ relPath: newPath, status: "A" });
      }
    } else {
      const p = fields[i + 1];
      i += 2;
      if (!p) continue;
      if (code === "A" || code === "M") changed.push({ relPath: p, status: code });
      else if (code === "D") deleted.push(p);
      // T(typechange)/U(unmerged)도 내용 변화로 취급해 시드에 포함 (무언 드롭 금지)
      else if (code === "T" || code === "U") changed.push({ relPath: p, status: "M" });
    }
  }

  // untracked 신규 파일 → status "A" (census ls-files --others와 동일 기준)
  for (const p of (await run(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0")) {
    if (p) changed.push({ relPath: p, status: "A" });
  }

  // dedupe(방어) + 정렬
  const seen = new Set<string>();
  const dedup = changed.filter((c) =>
    seen.has(c.relPath) ? false : (seen.add(c.relPath), true),
  );
  dedup.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  deleted.sort();
  return { baseRef, changed: dedup, deleted };
}

/**
 * 변경분을 map census 인벤토리(= U-A ignore 정합의 "분석 대상 전수")로 한정한다.
 * untracked 합류는 ktds 자체 산출물(.spec/.understand-anything/.omc/생성 docs)
 * 까지 변경분으로 빨아들이는데(실 E2E에서 57건 노이즈), census가 그것들을
 * 전부 배제하므로 교집합이 원칙적 필터다 — census 밖 시드는 어차피 도달성
 * 그래프에 없어 "시드가 census에 없음" 강등 노이즈만 만든다. 제외 목록은
 * 투명하게 반환(은폐 금지). deleted는 새 census에 있을 수 없으므로 이전
 * 인벤토리(있으면)로 필터한다.
 */
export function filterChangesToInventory(
  changes: CollectedChanges,
  inventory: ReadonlySet<string>,
  priorInventory?: ReadonlySet<string>,
): { changes: CollectedChanges; excludedChanged: string[]; excludedDeleted: string[] } {
  const keptChanged = changes.changed.filter((c) => inventory.has(c.relPath));
  const excludedChanged = changes.changed
    .filter((c) => !inventory.has(c.relPath))
    .map((c) => c.relPath);
  const keptDeleted = priorInventory
    ? changes.deleted.filter((p) => priorInventory.has(p))
    : changes.deleted;
  const excludedDeleted = priorInventory
    ? changes.deleted.filter((p) => !priorInventory.has(p))
    : [];
  return {
    changes: { baseRef: changes.baseRef, changed: keptChanged, deleted: keptDeleted },
    excludedChanged,
    excludedDeleted,
  };
}

export function changesToSeeds(changes: CollectedChanges): ImpactSeed[] {
  // git이 보고한 사실 — 기계 확정(CONFIRMED_AI). 사람 지정(path)과 구분.
  return changes.changed.map((c) => ({
    relPath: c.relPath,
    origin: "git" as const,
    confidence: "CONFIRMED_AI" as const,
  }));
}

// ── 예측 대조 (--sr) ─────────────────────────────────────────────────────────

export interface ReviewComparison {
  srId: string;
  /** 실제 변경됐지만 사전 예측(시드∪상류∪하류)에 없던 파일 — 예측 밖 변경. */
  unpredictedChanges: string[];
  /** 예측 시드였으나 변경도 삭제도 안 된 파일 — 계획 변경/누락 후보. */
  predictedSeedsNotChanged: string[];
  /** 예측 시드였는데 삭제된 파일 — "미변경"으로 오분류하지 않고 별도 표기 (리뷰 minor). */
  predictedSeedsDeleted: string[];
}

/** 순수 대조 — 사전 예측 ImpactResult × 실제 변경/삭제 파일 집합. */
export function buildReviewComparison(
  srId: string,
  prediction: ImpactResult,
  changedRelPaths: readonly string[],
  deletedRelPaths: readonly string[] = [],
): ReviewComparison {
  const predicted = new Set<string>([
    ...prediction.seeds.map((s) => s.relPath),
    ...prediction.upstream.files.map((f) => f.relPath),
    ...prediction.downstream.files.map((f) => f.relPath),
  ]);
  const changedSet = new Set(changedRelPaths);
  const deletedSet = new Set(deletedRelPaths);
  const unpredictedChanges = [...changedSet].filter((p) => !predicted.has(p)).sort();
  const seedPaths = prediction.seeds.map((s) => s.relPath);
  const predictedSeedsNotChanged = seedPaths
    .filter((p) => !changedSet.has(p) && !deletedSet.has(p))
    .sort();
  const predictedSeedsDeleted = seedPaths.filter((p) => deletedSet.has(p)).sort();
  return { srId, unpredictedChanges, predictedSeedsNotChanged, predictedSeedsDeleted };
}

// ── 체크리스트 문서 ──────────────────────────────────────────────────────────

export interface ReviewChecklistExtras {
  changes: CollectedChanges;
  comparison?: ReviewComparison | null;
  aggregate?: ImpactAggregateInputs;
  /** census 인벤토리 밖이라 제외된 변경 수 (자체 산출물·숨김 디렉터리 등 — 투명 표기). */
  excludedChanged?: number;
}

/**
 * 리뷰 체크리스트 GeneratedDoc — buildChangeImpact의 섹션(시드/집계/API/흐름/
 * DB/상류/하류/검토필요)을 재사용하고, 앞에 변경 사실(git)·삭제·예측 대조
 * 절을 끼운다. 시드 절 제목이 "변경 대상 (시드)"인데 review에선 시드=실제
 * 변경 파일이므로 의미가 그대로 성립한다.
 */
export function buildReviewChecklist(
  result: ImpactResult,
  verify: ImpactVerifyReport,
  extras: ReviewChecklistExtras,
): GeneratedDoc {
  const base = buildChangeImpact(result, verify, extras.aggregate);

  const head: DocSection[] = [];
  head.push({
    heading: "리뷰 범위 (git 변경분)",
    claims: [],
    prose:
      `base \`${extras.changes.baseRef}\` 대비 워킹트리 변경 ${extras.changes.changed.length}건` +
      `${extras.changes.deleted.length ? ` · 삭제 ${extras.changes.deleted.length}건` : ""}` +
      `${extras.excludedChanged ? ` (분석 인벤토리 밖 ${extras.excludedChanged}건 제외 — 자체 산출물·숨김 디렉터리 등)` : ""} — ` +
      "아래 시드/영향은 모두 이 실측 변경에서 도달성으로 계산된 것이다(예측 아님).",
  });
  if (extras.changes.deleted.length > 0) {
    head.push({
      heading: "삭제된 파일 (수동 확인)",
      claims: [],
      prose:
        extras.changes.deleted.map((p) => `- \`${p}\``).join("\n") +
        "\n\n삭제 파일은 현재 그래프에 노드가 없어 도달성 계산 밖이다 — 호출처 잔존 여부를 수동 확인할 것.",
    });
  }
  if (extras.comparison) {
    const c = extras.comparison;
    const lines: string[] = [`사전 영향 분석(SR \`${c.srId}\`) 대비:`, ""];
    lines.push(
      c.unpredictedChanges.length
        ? `**예측 밖 변경 ${c.unpredictedChanges.length}건** — 사전 분석의 시드∪상류∪하류에 없던 파일. 영향 분석 재실행 또는 변경 사유 확인:\n` +
            c.unpredictedChanges.map((p) => `- \`${p}\``).join("\n")
        : "예측 밖 변경 없음 — 실제 변경이 전부 사전 영향 범위 안.",
    );
    lines.push("");
    lines.push(
      c.predictedSeedsNotChanged.length
        ? `**예측 시드 중 미변경 ${c.predictedSeedsNotChanged.length}건** — 계획이 바뀌었거나 작업 누락 후보:\n` +
            c.predictedSeedsNotChanged.map((p) => `- \`${p}\``).join("\n")
        : "예측 시드는 전부 실제로 변경됨.",
    );
    if (c.predictedSeedsDeleted.length > 0) {
      lines.push("");
      lines.push(
        `**예측 시드 중 삭제됨 ${c.predictedSeedsDeleted.length}건** — 변경 대신 제거된 파일(의도 확인):\n` +
          c.predictedSeedsDeleted.map((p) => `- \`${p}\``).join("\n"),
      );
    }
    head.push({ heading: "예측 대비 (SR 대조)", claims: [], prose: lines.join("\n") });
  }

  return {
    filename: REVIEW_CHECKLIST_FILENAME,
    title: "변경 리뷰 체크리스트",
    sections: [...head, ...base.sections],
  };
}

/** docs/09_release/change-review-checklist.md 발행 (읽기전용 — registerDraft 미호출). */
export async function publishReviewChecklist(
  projectRoot: string,
  doc: GeneratedDoc,
): Promise<string> {
  const dir = path.join(projectRoot, "docs", "09_release");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, REVIEW_CHECKLIST_FILENAME);
  await fs.writeFile(file, renderMarkdown(doc, REVIEW_STATUS_LINE), "utf-8");
  return file;
}
