/**
 * ktds legacy-core — 설정(config) 모듈.
 *
 * `/understand-init` 이 기록하는 `understanding.config.json` 의 단일 스키마/IO 지점.
 * 블루프린트 관측 동작과 골든 등가(R3b): 기본값·필드명·파일명을 핀.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

/** 설정 파일명 — 프로젝트 루트에 기록. */
export const CONFIG_FILENAME = 'understanding.config.json'

/**
 * 설정 스키마.
 * - networkType: 데이터 민감도/네트워크 등급 (MVP=3, 비민감).
 * - outputLanguage: 산출물 언어 (기본 한국어).
 * - inferredRatio*Threshold: 추론(INFERRED) 비율 경고/차단 임계.
 * - supportedSchemaVersions: 호환 KG 스키마 버전.
 */
export const ConfigSchema = z
  .object({
    networkType: z.number().int().default(3),
    outputLanguage: z.string().default('ko'),
    inferredRatioWarnThreshold: z.number().min(0).max(1).default(0.3),
    inferredRatioBlockThreshold: z.number().min(0).max(1).default(0.6),
    supportedSchemaVersions: z.array(z.string()).default(['1.0.0']),
    relayBlock: z.object({ enabled: z.boolean().optional() }).optional(),
    /**
     * P3: 노드 편집/확정 시 기록할 사람(핸들). 설정하면 대시보드가 저장 시 approver
     * 기본값으로 쓴다(없으면 대시보드 1회 입력 폴백). dashboard config 로 복사된다.
     */
    approver: z.string().optional(),
  })
  .passthrough()

export type Config = z.infer<typeof ConfigSchema>

/** 기본 설정값(스키마 기본을 1회 평가하여 동결). */
export function defaultConfig(): Config {
  return ConfigSchema.parse({})
}

/** 설정 파일 경로. */
export function configPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_FILENAME)
}

/** 설정 로드. 없으면 null. 깨졌으면 throw(조용한 기본값 대체 금지 — 정직성). */
export function loadConfig(projectRoot: string): Config | null {
  const p = configPath(projectRoot)
  if (!existsSync(p)) return null
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  return ConfigSchema.parse(raw)
}

/** 설정 기록(안정 들여쓰기 2칸, 후행 개행). */
export function writeConfig(projectRoot: string, config: Config): void {
  const validated = ConfigSchema.parse(config)
  writeFileSync(configPath(projectRoot), JSON.stringify(validated, null, 2) + '\n', 'utf8')
}
