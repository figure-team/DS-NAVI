/**
 * 위키 오케스트레이션 (ADR-004 T7/ID7) — project→links→index→hub-inject→graph-emit
 * 합성 + staging→원자 발행.
 *
 * **기본 = 5종 + 위키**(CLI가 runDocsPipeline 후 generateWiki 호출). 세분화 노트·index.md는
 * **doc-state 밖**(registerDraft/publishStaging 경로 미경유 — DRAFT/검토/승인 게이트는 5종
 * 전용). 위키 전용 staging→원자 교체로 분리해 부분 발행이 기존 vault를 오염시키지 않는다
 * (pre-mortem). 재실행 멱등(허브 펜스 교체·노트 덮어쓰기). WIKI_GENERATED 감사(상태 추적 아님).
 *
 * 출력: docs/{feature,api,table}/*.md · docs/index.md · docs/0N.md 허브 주입(옵시디언 vault) ·
 * **<root>/.understand-anything/{wiki-graph.json,wiki-meta.json}** — 코드그래프(knowledge-graph.json)
 * 옆에 별도 파일로 두어, 대시보드를 GRAPH_DIR=root로 띄우면 "문서" 토글로 같은 화면에서 로드
 * (domain-graph.json과 동일 패턴 — 코드그래프 미덮어씀).
 */

import { writeFile, readFile, mkdir, rm, rename, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { CanonicalGraph } from "../types.js";
import { acquireLock, releaseLock } from "../lock/index.js";
import { logEvent } from "../audit/index.js";
import { stableJson } from "../domain-map/persist.js";
import { projectNotes } from "./project.js";
import { deriveLinks } from "./links.js";
import { buildIndex } from "./index-gen.js";
import { injectHubLinks } from "./hub-inject.js";
import { buildKnowledgeGraph, type HubArticle } from "./graph-emit.js";
import { renderNote, extractProse } from "./render.js";
import { toWikiTarget } from "./slug.js";
import { HUB_DEFS } from "./hubs.js";
import type { WikiLink, WikiNote } from "./types.js";
import { writeFileAtomic } from "../utils/fs.js";

/** 노트 본문 산문 주입자(host) — 미지정 시 skeleton-only(결정론). */
export type WikiProseProvider = (note: WikiNote) => Promise<string>;

export interface GenerateWikiOptions {
  /** step 계층 포함(기본 false). */
  includeSteps?: boolean;
  /** 노트 산문 주입(기본 없음 = skeleton). */
  prose?: WikiProseProvider;
  /**
   * 디스크에 이미 발행된 노트 .md에서 host가 채운 산문을 다시 읽어 재주입(기본 false).
   * `prose`가 명시되면 그쪽이 우선(이 옵션 무시). 재생성·전체 재실행에도 host 편집이
   * 보존되고 wiki-graph.json(대시보드 정본)까지 산문이 전파된다(ADR-004 후속, .md 단일 출처).
   */
  reingestProse?: boolean;
  /** 감사·staging 식별. */
  runId?: string;
  /** knowledge-graph.json project.analyzedAt(골든 제외). */
  analyzedAt?: string;
  /** meta.json generatedAt(골든 제외). */
  generatedAt?: string;
}

export interface GenerateWikiResult {
  noteCount: number;
  notesWritten: string[];
  hubsInjected: string[];
  graphPath: string;
  indexPath: string;
  /** filePath 조인 미스 endpoint(소유 기능 못 찾음). */
  unresolvedEndpoints: string[];
}

/** 노트 계층 하위 폴더(원자 교체 단위). feature/step은 feature 아래라 별도 불필요. */
const NOTE_LAYER_DIRS = ["feature", "api", "table"] as const;

async function pathExists(p: string): Promise<boolean> {
  // access는 내용을 읽지 않고 파일/디렉터리를 동형으로 판정(EISDIR 의존 제거).
  return access(p).then(() => true, () => false);
}

/**
 * 기존 발행 노트 .md에서 host 산문을 재흡수해 relPath→prose provider를 만든다. 파일 부재
 * (최초 실행)는 산문 없음으로 흡수 — extractProse가 ""를 주면 renderNote가 skeleton과 byte
 * 동일이라 무해하다. ENOENT만 허용(그 외 IO 오류는 전파). 슬러그(relPath) 안정성에 의존하므로
 * 노드 자연키가 바뀌면 해당 산문은 매칭 실패(=유실, 의도된 한계 — host 재편집).
 */
async function buildReingestProvider(
  docsDir: string,
  notes: WikiNote[],
): Promise<WikiProseProvider> {
  const byRelPath = new Map<string, string>();
  for (const n of notes) {
    let md: string;
    try {
      md = await readFile(join(docsDir, n.relPath), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    const prose = extractProse(md);
    if (prose) byRelPath.set(n.relPath, prose);
  }
  return async (note) => byRelPath.get(note.relPath) ?? "";
}

/**
 * 5종 발행 후 위키 산출. graph는 (병합된) CanonicalGraph. docs/ 허브는 이미 디스크에
 * 있어야 함(읽어서 주입·graph article에 포함).
 */
export async function generateWiki(
  projectRoot: string,
  graph: CanonicalGraph,
  options: GenerateWikiOptions = {},
): Promise<GenerateWikiResult> {
  const includeSteps = options.includeSteps ?? false;
  const runId = options.runId ?? `wiki-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const docsDir = join(projectRoot, "docs");
  const specDir = join(projectRoot, ".spec");

  // 1) 노트 + 링크
  const { notes, unresolvedEndpoints } = deriveLinks(graph, projectNotes(graph, { includeSteps }));

  // 2) 노트 본문 렌더(산문 옵션). prose 명시 > reingest > skeleton.
  //    재흡수는 staging 스왑(6단계) 전에 기존 .md를 읽으므로 단일 프로세스에선 파일이 아직
  //    제자리에 있다(projectNotes/deriveLinks/renderNote도 모두 락 밖에서 도는 기존 패턴과 동일).
  //    동시 writer는 락(6단계)이 직렬화하지만 재흡수 read는 락 밖이라, 동시 스왑 중인 .md를
  //    읽으면 해당 노트 산문이 ENOENT로 조용히 누락될 수 있다(단일-writer 전제, O3).
  const proseProvider: WikiProseProvider | undefined =
    options.prose ??
    (options.reingestProse ? await buildReingestProvider(docsDir, notes) : undefined);
  const contentByUid = new Map<string, string>();
  for (const n of notes) {
    const prose = proseProvider ? await proseProvider(n) : undefined;
    contentByUid.set(n.nodeUid, renderNote(n, prose));
  }

  // 3) index.md
  const index = buildIndex(notes);

  // 4) 허브 읽기 — 분배 대상(03→feature/04→api/05→table)만 링크섹션 주입.
  //    01·02는 분배 대상이 아니므로 펜스를 넣지 않는다(순수 5종과 바이트 동일 유지);
  //    graph article에는 raw 본문 그대로 포함.
  const hubArticles: HubArticle[] = [];
  const injectedHubs: Array<{ file: string; content: string }> = [];
  for (const def of HUB_DEFS) {
    let raw: string;
    try {
      raw = await readFile(join(docsDir, def.file), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue; // 허브 부재 → 건너뜀
      throw err;
    }
    let content = raw;
    if (def.layer) {
      const links: WikiLink[] = notes
        .filter((n) => n.layer === def.layer)
        .map((n) => ({ targetRelPath: toWikiTarget(n.relPath), label: n.title }));
      content = injectHubLinks(raw, links);
      injectedHubs.push({ file: def.file, content });
    }
    hubArticles.push({ id: def.target, title: def.title, relPath: def.file, content, layer: def.layer });
  }

  // 5) wiki-graph.json — **프로젝트 루트** `.understand-anything/`에 emit(코드그래프 옆).
  //    대시보드를 GRAPH_DIR=root로 띄우면 코드 그래프와 같은 화면에서 "문서" 토글로 로드된다
  //    (domain-graph.json과 동일 패턴). 코드 그래프(knowledge-graph.json)는 덮어쓰지 않음.
  //    filePath는 docs/ 접두 → Files 트리·CodeViewer가 docs/ 하위 노트를 해소. 마크다운
  //    vault(docs/*.md, index.md)는 그대로 두어 옵시디언이 소비.
  const knowledgeGraph = buildKnowledgeGraph({
    project: graph.project,
    notes,
    hubs: hubArticles,
    contentByUid,
    analyzedAt: options.analyzedAt,
    pathPrefix: "docs/",
  });

  // 6) 발행 — 5종과 동일 락으로 직렬화(동시 wiki/5종 실행 시 dir 스왑·허브 재작성 경합 차단).
  //    위키 단독 실행도 락을 잡는다(generateWiki는 runDocsPipeline 락 해제 후 호출됨).
  const rootUaDir = join(projectRoot, ".understand-anything");
  const graphPath = join(rootUaDir, "wiki-graph.json");
  await acquireLock(specDir);
  try {
    const stagingRoot = join(specDir, "runs", runId, "wiki-staging");
    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingRoot, { recursive: true });
    try {
      for (const n of notes) {
        const p = join(stagingRoot, n.relPath);
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, contentByUid.get(n.nodeUid)!, "utf-8");
      }
      // 노트 계층 dir 크래시-안전 스왑: 기존을 .old로 비키고→staging을 제자리로→.old 제거.
      // 파괴적 rm이 백업만 건드리므로 크래시 시 항상 old/new 중 하나가 온전(rm-후-rename 공백 제거).
      for (const dir of NOTE_LAYER_DIRS) {
        const src = join(stagingRoot, dir);
        const dst = join(docsDir, dir);
        const backup = `${dst}.old`;
        const hadDst = await pathExists(dst);
        if (hadDst) {
          await rm(backup, { recursive: true, force: true });
          await rename(dst, backup);
        }
        if (await pathExists(src)) {
          await rename(src, dst);
        }
        // staging에 없던 계층(노트 0건)이면 dst는 backup으로 비켜진 채 제거됨 = stale 정리.
        if (hadDst) await rm(backup, { recursive: true, force: true });
      }
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }

    // index·graph·meta·허브 — 원자 파일 쓰기
    await writeFileAtomic(join(docsDir, "index.md"), index);
    await writeFileAtomic(graphPath, stableJson(knowledgeGraph));
    await writeFileAtomic(
      join(rootUaDir, "wiki-meta.json"), // 코드그래프 meta.json과 충돌 회피(별도 이름)
      stableJson({
        kind: "wiki",
        noteCount: notes.length,
        includeSteps,
        generatedAt: options.generatedAt ?? "",
      }),
    );
    for (const h of injectedHubs) await writeFileAtomic(join(docsDir, h.file), h.content);

    // 7) 감사 (상태 추적 아님 — IMPACT_ANALYZED류)
    await logEvent(specDir, "WIKI_GENERATED", {
      runId,
      detail: {
        notes: notes.length,
        includeSteps,
        hubs: injectedHubs.length,
        unresolvedEndpoints: unresolvedEndpoints.length,
      },
    });
  } finally {
    await releaseLock(specDir);
  }

  return {
    noteCount: notes.length,
    notesWritten: notes.map((n) => n.relPath),
    hubsInjected: injectedHubs.map((h) => h.file),
    graphPath,
    indexPath: join(docsDir, "index.md"),
    unresolvedEndpoints,
  };
}
