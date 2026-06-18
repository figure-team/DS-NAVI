/**
 * 계층(layer) 동적 추론 — ground-truth 신호 우선(AC-2: 하드코딩 4계층 아님).
 *
 * 우선순위: DB > DAO > API > SERVICE > unknown.
 * 신호(LayerSignals)는 routes/edges 산출물에서 결정론적으로 도출한다.
 * 어떤 신호에도 걸리지 않으면 'unknown'(정직성: 조용히 끼워맞추지 않음).
 */
import { basename } from 'node:path'
import type { EdgesReport, FlowLayer, RoutesReport } from './types.js'

/** 계층 추론에 쓰는 파일 집합 신호. */
export interface LayerSignals {
  /** route/batch 진입 파일 → API. */
  routeEntryFiles: ReadonlySet<string>
  /** mybatis/mapper-xml 엣지 참여 파일 → DAO. */
  daoFiles: ReadonlySet<string>
  /** mapper-xml 타겟 / .sql / *Mapper.xml → DB. */
  dbFiles: ReadonlySet<string>
  /** injection/impl 엣지 타겟 → SERVICE. */
  serviceFiles: ReadonlySet<string>
}

/** routes + edges 로부터 결정론적으로 신호 집합을 구성. */
export function buildLayerSignals(routes: RoutesReport, edges: EdgesReport): LayerSignals {
  const routeEntryFiles = new Set<string>()
  for (const r of routes.routes) routeEntryFiles.add(r.filePath)
  for (const b of routes.batchEntries) routeEntryFiles.add(b.filePath)

  const daoFiles = new Set<string>()
  const dbFiles = new Set<string>()
  const serviceFiles = new Set<string>()

  for (const e of edges.edges) {
    if (e.kind === 'mapper-xml') {
      daoFiles.add(e.source) // mapper 인터페이스
      dbFiles.add(e.target) // *.xml
    } else if (e.kind === 'mybatis') {
      daoFiles.add(e.target)
    } else if (e.kind === 'injection' || e.kind === 'impl') {
      serviceFiles.add(e.target)
    }
  }

  return { routeEntryFiles, daoFiles, dbFiles, serviceFiles }
}

function nameToken(relPath: string, className: string | null): string {
  return className ?? basename(relPath).replace(/\.[^.]+$/, '')
}

/**
 * 한 파일의 계층을 추론한다.
 * @param relPath census relPath
 * @param className 클래스명(없으면 파일명에서 도출)
 */
export function deriveStepLayer(
  relPath: string,
  className: string | null,
  signals: LayerSignals,
): FlowLayer {
  const name = nameToken(relPath, className)

  // DB: 가장 강한 ground-truth(스키마/매핑 파일).
  if (relPath.endsWith('.sql') || /Mapper\.xml$/.test(relPath) || signals.dbFiles.has(relPath)) {
    return 'db'
  }
  // DAO: mybatis/mapper 신호 또는 이름 관례.
  if (signals.daoFiles.has(relPath) || /(Mapper|Dao|Repository)$/.test(name)) {
    return 'dao'
  }
  // API: 진입 파일 또는 이름/경로 관례.
  if (
    signals.routeEntryFiles.has(relPath) ||
    /(Controller|Resource|ActionBean|Endpoint)$/.test(name) ||
    /(^|\/)(controller|api|rest)(\/|$)/i.test(relPath)
  ) {
    return 'api'
  }
  // SERVICE: 주입/구현 타겟 또는 이름 관례.
  if (signals.serviceFiles.has(relPath) || /(Service|ServiceImpl|Manager|Facade)$/.test(name)) {
    return 'service'
  }
  return 'unknown'
}

/**
 * 도달 파일들에 계층을 일괄 배정(결정론, relPath 정렬).
 * 반환: relPath -> layer 맵 + 사용된 계층 집합(동적 계층 증거, AC-2).
 */
export function assignLayers(
  relPaths: readonly string[],
  signals: LayerSignals,
): { byFile: Record<string, FlowLayer>; layersUsed: FlowLayer[] } {
  const byFile: Record<string, FlowLayer> = {}
  const used = new Set<FlowLayer>()
  for (const rel of [...relPaths].sort()) {
    const layer = deriveStepLayer(rel, null, signals)
    byFile[rel] = layer
    used.add(layer)
  }
  const order: FlowLayer[] = ['api', 'service', 'dao', 'db', 'unknown']
  return { byFile, layersUsed: order.filter((l) => used.has(l)) }
}
