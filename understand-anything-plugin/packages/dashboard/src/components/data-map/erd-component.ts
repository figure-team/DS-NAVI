import type { DbTable } from "./types";
import { inferFkEdges } from "./erd-infer";

/**
 * FK 연계 컴포넌트(ERD 연계 보기) — 선택 테이블에서 FK 를 무향으로 따라가 닿는
 * 테이블 전체(연결 컴포넌트)를 구한다. 실측(egov) 컴포넌트 분포는 최대 9로 작지만,
 * 중심 테이블형 스키마에서 한 섬이 수백 개일 수 있어 CAP 초과 시 홉 제한으로 폴백.
 */

export interface FkEdgePair {
  source: string;
  target: string;
}

/** 컴포넌트가 이보다 크면 CAP_DEPTH 홉 제한 BFS 로 폴백(전체 그래프 퇴화 방지). */
export const COMPONENT_CAP = 60;
export const COMPONENT_CAP_DEPTH = 3;

/**
 * 선언 FK(참조 대상이 스키마에 있고 자기참조 아님) + 이름 기반 추정 FK(erd-infer)의
 * 무향 탐색용 엣지 쌍 — ErdTab '전체' 보기의 엣지 집합과 동일 규칙.
 */
export function fkEdgePairs(tables: DbTable[]): FkEdgePair[] {
  const byLower = new Map(tables.map((t) => [t.name.toLowerCase(), t]));
  const out: FkEdgePair[] = [];
  for (const t of tables) {
    for (const fk of t.foreignKeys ?? []) {
      const target = byLower.get(fk.refTable.toLowerCase());
      if (!target || target.name === t.name) continue;
      out.push({ source: t.name, target: target.name });
    }
  }
  for (const e of inferFkEdges(tables)) out.push({ source: e.source, target: e.target });
  return out;
}

export interface FkComponent {
  /** 시작 테이블 포함 컴포넌트 테이블명 집합. */
  tables: Set<string>;
  /** CAP 초과로 홉 제한 폴백이 적용됐는가(칩에 "N홉 제한" 표기). */
  capped: boolean;
}

/** 시작 테이블의 FK 연결 컴포넌트(무향 BFS, 결정론) — CAP 초과 시 홉 제한 재탐색. */
export function fkComponent(start: string, edges: FkEdgePair[], cap = COMPONENT_CAP): FkComponent {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const s = adj.get(a) ?? new Set<string>();
    s.add(b);
    adj.set(a, s);
  };
  for (const e of edges) {
    add(e.source, e.target);
    add(e.target, e.source);
  }
  const bfs = (maxDepth: number): Set<string> => {
    const seen = new Set<string>([start]);
    let frontier = [start];
    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const n of frontier) {
        for (const m of adj.get(n) ?? []) {
          if (seen.has(m)) continue;
          seen.add(m);
          next.push(m);
        }
      }
      frontier = next;
    }
    return seen;
  };
  const full = bfs(Number.POSITIVE_INFINITY);
  if (full.size <= cap) return { tables: full, capped: false };
  return { tables: bfs(COMPONENT_CAP_DEPTH), capped: true };
}
