import type { EdgesReport, RoutesReport } from "./types.js";

// S6 step layer 분류기 (per-step 역할 = 그 step 파일의 계층 역할).
//
// 대시보드는 파일명 휴리스틱만으로 추측해 왔다(flowLayer.ts). 하지만 엔진은
// routes/edges 리포트를 갖고 있어 "이 파일은 mybatis 간선의 끝 = 확실히 DAO",
// "route/batch 엔트리 파일 = 확실히 API" 같은 ground-truth를 안다. 그 신호를
// 여기서 step 노드에 박아 대시보드가 추측 대신 진실을 읽게 한다.
//
// 결정론(M1/A11): 입력(relPath/className/precomputed 집합)의 순수 함수다 —
// Date/random 없음. 동일 입력 → 동일 layer. skeleton diff는 이 additive 필드
// 외에는 변하지 않는다.

/** step 파일의 계층 역할. unknown은 정직한 가시 결과(은닉 오분류 금지). */
export const FLOW_LAYERS = ["api", "service", "dao", "db", "unknown"] as const;
export type FlowLayer = (typeof FLOW_LAYERS)[number];

/**
 * routes + edgesReport에서 한 번만 도출하는 layer 신호 집합. buildSkeleton이
 * 루프 밖에서 만들어 각 step에 넘긴다(파일당 재계산 금지).
 *
 * - routeEntryFiles: route/batch 엔트리를 선언한 파일 (API ground-truth).
 * - daoFiles: mybatis/mapper-xml 간선의 source 또는 target 파일 (DAO ground-truth).
 * - dbFiles: mybatis/mapper-xml 간선의 target 파일 (XML/SQL 매퍼 아티팩트).
 * - serviceFiles: injection/impl 간선의 target 파일 (DI/구현 대상 = 서비스).
 */
export interface LayerSignals {
  routeEntryFiles: ReadonlySet<string>;
  daoFiles: ReadonlySet<string>;
  dbFiles: ReadonlySet<string>;
  serviceFiles: ReadonlySet<string>;
}

const DB_EXTENSIONS = [".sql"] as const;
const DAO_EDGE_KINDS = new Set(["mybatis", "mapper-xml"]);
const SERVICE_EDGE_KINDS = new Set(["injection", "impl"]);

// 파일명/className 토큰 (간선 신호가 없을 때만 쓰는 폴백). 간선 신호가
// 토큰을 항상 이긴다 — 그게 이 엔진 분류기의 존재 이유다.
const DAO_NAME_RE = /(?:mapper|dao|repository)$/i;
const API_NAME_RE = /(?:controller|resource|action|endpoint)$/i;
const SERVICE_NAME_RE = /(?:serviceimpl|service)$/i;
const API_PATH_TOKENS = ["controller", "controllers", "rest", "web", "api", "resource", "resources", "endpoint", "endpoints", "action", "actions"];

function basename(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  return base.replace(/\.[^.]+$/, "");
}

function lower(s: string): string {
  return s.toLowerCase();
}

function isDbFile(relPath: string): boolean {
  const lp = lower(relPath);
  return DB_EXTENSIONS.some((ext) => lp.endsWith(ext));
}

function isMapperXml(relPath: string): boolean {
  const lp = lower(relPath);
  return lp.endsWith("mapper.xml");
}

/**
 * step 파일의 layer를 도출 — 가장 권위 있는 신호 우선.
 *   1. DB:      .sql / *Mapper.xml / mapper-xml 간선 target(dbFiles).
 *   2. DAO:     mybatis/mapper-xml 간선 파일(daoFiles) OR *Mapper/*Dao/*Repository.
 *   3. API:     route/batch 엔트리 파일(routeEntryFiles) OR *Controller/*Resource/... .
 *   4. SERVICE: injection/impl 간선 target(serviceFiles) OR *Service/*ServiceImpl.
 *   5. else:    unknown.
 * 간선 신호가 파일명 토큰을 이긴다(예: mybatis 간선 = 무조건 DAO).
 */
export function deriveStepLayer(
  relPath: string,
  className: string | null,
  signals: LayerSignals,
): FlowLayer {
  // 1. DB — SQL/매퍼 XML 아티팩트, 또는 mapper-xml 간선의 끝(테이블/SQL 타깃).
  if (isDbFile(relPath) || isMapperXml(relPath) || signals.dbFiles.has(relPath)) {
    return "db";
  }

  // 2. DAO — mybatis/mapper-xml 간선 파일(ground-truth), 또는 파일명/클래스명.
  const name = className ?? basename(relPath);
  if (signals.daoFiles.has(relPath) || DAO_NAME_RE.test(name)) {
    return "dao";
  }

  // 3. API — route/batch 엔트리 파일(ground-truth), 또는 파일명/클래스명/경로.
  if (
    signals.routeEntryFiles.has(relPath) ||
    API_NAME_RE.test(name) ||
    hasPathToken(relPath, API_PATH_TOKENS)
  ) {
    return "api";
  }

  // 4. SERVICE — injection/impl 간선 target(ground-truth), 또는 파일명/클래스명.
  if (signals.serviceFiles.has(relPath) || SERVICE_NAME_RE.test(name)) {
    return "service";
  }

  return "unknown";
}

function hasPathToken(relPath: string, tokens: readonly string[]): boolean {
  const segs = lower(relPath).split(/[\\/]+/);
  return segs.some((seg) => tokens.includes(seg));
}

/**
 * routes + edgesReport에서 layer 신호 집합을 한 번 도출(결정론 — 순서 무관한
 * 집합 멤버십만 본다). buildSkeleton이 루프 밖에서 호출한다.
 */
export function buildLayerSignals(
  routes: RoutesReport,
  edgesReport: EdgesReport,
): LayerSignals {
  const routeEntryFiles = new Set<string>();
  for (const r of routes.routes) routeEntryFiles.add(r.filePath);
  for (const b of routes.batchEntries) routeEntryFiles.add(b.filePath);

  const daoFiles = new Set<string>();
  const dbFiles = new Set<string>();
  const serviceFiles = new Set<string>();
  for (const e of edgesReport.edges) {
    if (DAO_EDGE_KINDS.has(e.kind)) {
      // 양 끝 모두 DAO 흐름에 관여: source=호출 Java(Mapper 인터페이스),
      // target=XML 매퍼. source는 DAO, target은 DB 아티팩트.
      daoFiles.add(e.source);
      dbFiles.add(e.target);
    }
    if (SERVICE_EDGE_KINDS.has(e.kind)) {
      serviceFiles.add(e.target);
    }
  }

  return { routeEntryFiles, daoFiles, dbFiles, serviceFiles };
}
