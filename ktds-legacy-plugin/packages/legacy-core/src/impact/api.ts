/**
 * API/배치 진입점 영향 — 2단 계산(정확도 + 교차검증).
 *
 *   1차 ownership: slices.ownership[seed].owners = 시드에 도달하는 root(진입점 선언
 *     파일). depthCap·전 간선종류로 계산된 캡일관 인덱스 재사용.
 *   2차 reverse:  reach 의 upstream 파일집합 ∩ {route/batch 선언 파일}.
 * both(양쪽 일치)=CONFIRMED_AI, ownership-only=INFERRED(약간선 경유 가능),
 * reverse-only=UNVERIFIED(ownership 이 못 본 이상치). 불일치는 crossCheckDiff 로 표면화.
 */
import type { BatchEntry, Ownership, RouteEntry } from '../domain-map/types.js'
import type { ApiImpact } from './types.js'
import { cmp } from '../utils/cmp.js'

export interface ApiImpactResult {
  api: ApiImpact[]
  crossCheckDiff: Array<{ id: string; side: 'ownership-only' | 'reverse-only' }>
}

export function computeApiImpact(
  seeds: readonly string[],
  /** reach upstream 의 relPath 목록(시드 제외). */
  reverseFiles: readonly string[],
  ownership: readonly Ownership[],
  routes: readonly RouteEntry[],
  batchEntries: readonly BatchEntry[],
): ApiImpactResult {
  const ownByFile = new Map(ownership.map((o) => [o.relPath, o.owners]))

  // 1차: 시드들에 도달하는 모든 root(진입점 선언 파일).
  const ownershipRoots = new Set<string>()
  for (const seed of seeds) {
    for (const owner of ownByFile.get(seed) ?? []) ownershipRoots.add(owner)
  }
  // 2차: 시드 자신 + 역방향 영향 파일(시드가 곧 진입점일 수 있으므로 포함).
  const reverseSet = new Set<string>([...seeds, ...reverseFiles])

  const api: ApiImpact[] = []
  const crossCheckDiff: ApiImpactResult['crossCheckDiff'] = []

  const classify = (
    filePath: string,
  ): { via: ApiImpact['via']; confidence: ApiImpact['confidence'] } | null => {
    const ownHit = ownershipRoots.has(filePath)
    const revHit = reverseSet.has(filePath)
    if (ownHit && revHit) return { via: 'both', confidence: 'CONFIRMED_AI' }
    if (ownHit) return { via: 'ownership', confidence: 'INFERRED' }
    if (revHit) return { via: 'reverse', confidence: 'UNVERIFIED' }
    return null
  }

  for (const route of routes) {
    const c = classify(route.filePath)
    if (!c) continue
    api.push({
      targetKind: 'route',
      id: route.routeId,
      filePath: route.filePath,
      line: route.line,
      handler: route.handler,
      via: c.via,
      confidence: c.confidence,
    })
    if (c.via !== 'both') {
      crossCheckDiff.push({
        id: route.routeId,
        side: c.via === 'ownership' ? 'ownership-only' : 'reverse-only',
      })
    }
  }

  for (const batch of batchEntries) {
    const c = classify(batch.filePath)
    if (!c) continue
    api.push({
      targetKind: 'batch',
      id: batch.entryId,
      filePath: batch.filePath,
      line: batch.line,
      handler: batch.handler,
      via: c.via,
      confidence: c.confidence,
    })
    if (c.via !== 'both') {
      crossCheckDiff.push({
        id: batch.entryId,
        side: c.via === 'ownership' ? 'ownership-only' : 'reverse-only',
      })
    }
  }

  api.sort((a, b) => cmp(a.targetKind, b.targetKind) || cmp(a.id, b.id))
  crossCheckDiff.sort((a, b) => cmp(a.id, b.id) || cmp(a.side, b.side))
  return { api, crossCheckDiff }
}
