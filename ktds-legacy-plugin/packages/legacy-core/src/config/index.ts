/**
 * ktds legacy-core — 설정(config) 모듈.
 *
 * `/understand-init` 이 기록하는 `understanding.config.json` 의 단일 스키마/IO 지점.
 * 블루프린트 관측 동작과 골든 등가(R3b): 기본값·필드명·파일명을 핀.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { CustomClientSpecSchema } from '../interface-scan/types.js'

/** 설정 파일명 — 프로젝트 루트에 기록. */
export const CONFIG_FILENAME = 'understanding.config.json'

/**
 * 설정 스키마.
 * - networkType: 데이터 민감도/네트워크 등급 (MVP=3, 비민감).
 * - outputLanguage: 산출물 언어 (기본 한국어).
 * - inferredRatio*Threshold: 추론(INFERRED) 비율 경고/차단 임계.
 * - supportedSchemaVersions: 호환 KG 스키마 버전.
 */
/**
 * 화면설계서(screen-capture) 설정 — `/understand-screens` 캡처 러너가 사용.
 * baseUrl 무응답 시 startCommand 로 자동 기동(우리가 띄운 것만 종료),
 * scenarios 로 로그인 등 상태 필요 화면을 커버한다.
 */
export const ScreensConfigSchema = z.object({
  /** 분석 대상 앱 기본 URL (예: "http://localhost:8080/jpetstore"). */
  baseUrl: z.string(),
  /** 앱 기동 명령(spawn args 배열, 셸 미경유; cwd=프로젝트 루트). */
  startCommand: z.array(z.string()).optional(),
  /** 기동 판정용 경로(baseUrl 상대). */
  readyPath: z.string().default('/'),
  readyTimeoutMs: z.number().int().default(180_000),
  viewport: z
    .object({
      width: z.number().int().default(1280),
      height: z.number().int().default(800),
    })
    .default({ width: 1280, height: 800 }),
  /** 크롤 최대 화면 수. */
  maxPages: z.number().int().default(40),
  /** 방문 제외 URL 정규식 문자열 목록. */
  exclude: z.array(z.string()).default([]),
  /** 크롤 시드 추가 URL(baseUrl 상대) — 링크로 발견 불가한 화면(검색 결과 등). */
  seedUrls: z.array(z.string()).default([]),
  /** 상태 필요 화면 도달 시나리오(로그인, 장바구니 담기 등). */
  scenarios: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        steps: z.array(
          z.object({
            /** capture = 그 시점의 현재 페이지(또는 url)를 화면으로 캡처(중간 상태용). */
            action: z.enum(['goto', 'click', 'fill', 'waitFor', 'capture']),
            url: z.string().optional(),
            selector: z.string().optional(),
            value: z.string().optional(),
            /** click 으로 뜨는 alert/confirm 처리(기본 dismiss — 상태 변경 방지). */
            dialog: z.enum(['accept', 'dismiss']).optional(),
          }),
        ),
        /** 시나리오 수행 후 캡처할 URL 목록(baseUrl 상대). */
        captureAfter: z.array(z.string()).default([]),
      }),
    )
    .default([]),
})
export type ScreensConfig = z.infer<typeof ScreensConfigSchema>

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
    /** 화면설계서 캡처 설정 — 없으면 `/understand-screens` 가 설정 안내 후 중단. */
    screens: ScreensConfigSchema.optional(),
    /**
     * W1 인터페이스 스캔 설정 — 사내 공통 연계모듈(EAI 래퍼 등)을 화이트리스트에
     * 주입하는 seam. 카탈로그 밖 타입은 이걸로 등록해야 recall 이 나온다.
     */
    interfaceScan: z
      .object({ clients: z.array(CustomClientSpecSchema).default([]) })
      .optional(),
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
