/**
 * 5 허브(docs/0N.md) 정의 (ADR-004 ID6) — index-gen·graph-emit·orchestrate 공유.
 *
 * 허브는 **물리 이동 없이** docs/0N.md에 그대로 남고(상태키 불변), 대시보드에선 ID10
 * emit이 "00_개요" layer로 묶는다. file/target/title은 doc-generator 5종과 일치.
 * layer가 있는 허브는 해당 계층 노트로 링크섹션·related 엣지를 분배(03→feature/04→api/
 * 05→table; 01·02는 분배 대상 없음).
 */

import type { WikiLayer } from "./types.js";

export interface HubDef {
  /** docs/ 파일명. */
  file: string;
  /** 위키링크/노드 id(.md 없이). */
  target: string;
  /** doc-generator 5종 제목. */
  title: string;
  /** 링크 분배 대상 계층(01·02는 없음). */
  layer?: WikiLayer;
}

export const HUB_DEFS: ReadonlyArray<HubDef> = [
  { file: "01_tech-stack.md", target: "01_tech-stack", title: "기술 스택" },
  { file: "02_architecture.md", target: "02_architecture", title: "아키텍처" },
  { file: "03_feature-spec.md", target: "03_feature-spec", title: "기능 명세", layer: "feature" },
  { file: "04_api-spec.md", target: "04_api-spec", title: "API 명세", layer: "api" },
  { file: "05_db-spec.md", target: "05_db-spec", title: "DB 명세", layer: "table" },
];
