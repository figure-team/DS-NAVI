import { z } from 'zod';
/** 설정 파일명 — 프로젝트 루트에 기록. */
export declare const CONFIG_FILENAME = "understanding.config.json";
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
export declare const ScreensConfigSchema: z.ZodObject<{
    baseUrl: z.ZodString;
    startCommand: z.ZodOptional<z.ZodArray<z.ZodString>>;
    readyPath: z.ZodDefault<z.ZodString>;
    readyTimeoutMs: z.ZodDefault<z.ZodNumber>;
    viewport: z.ZodDefault<z.ZodObject<{
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    maxPages: z.ZodDefault<z.ZodNumber>;
    exclude: z.ZodDefault<z.ZodArray<z.ZodString>>;
    seedUrls: z.ZodDefault<z.ZodArray<z.ZodString>>;
    censusSeed: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        maxPages: z.ZodDefault<z.ZodNumber>;
        scenarioId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    scenarios: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        steps: z.ZodArray<z.ZodObject<{
            action: z.ZodEnum<{
                goto: "goto";
                click: "click";
                fill: "fill";
                waitFor: "waitFor";
                capture: "capture";
            }>;
            url: z.ZodOptional<z.ZodString>;
            selector: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodString>;
            dialog: z.ZodOptional<z.ZodEnum<{
                accept: "accept";
                dismiss: "dismiss";
            }>>;
        }, z.core.$strip>>;
        captureAfter: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ScreensConfig = z.infer<typeof ScreensConfigSchema>;
export declare const ConfigSchema: z.ZodObject<{
    networkType: z.ZodDefault<z.ZodNumber>;
    outputLanguage: z.ZodDefault<z.ZodString>;
    inferredRatioWarnThreshold: z.ZodDefault<z.ZodNumber>;
    inferredRatioBlockThreshold: z.ZodDefault<z.ZodNumber>;
    supportedSchemaVersions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    relayBlock: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    approver: z.ZodOptional<z.ZodString>;
    screens: z.ZodOptional<z.ZodObject<{
        baseUrl: z.ZodString;
        startCommand: z.ZodOptional<z.ZodArray<z.ZodString>>;
        readyPath: z.ZodDefault<z.ZodString>;
        readyTimeoutMs: z.ZodDefault<z.ZodNumber>;
        viewport: z.ZodDefault<z.ZodObject<{
            width: z.ZodDefault<z.ZodNumber>;
            height: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
        maxPages: z.ZodDefault<z.ZodNumber>;
        exclude: z.ZodDefault<z.ZodArray<z.ZodString>>;
        seedUrls: z.ZodDefault<z.ZodArray<z.ZodString>>;
        censusSeed: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            maxPages: z.ZodDefault<z.ZodNumber>;
            scenarioId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
        scenarios: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
            steps: z.ZodArray<z.ZodObject<{
                action: z.ZodEnum<{
                    goto: "goto";
                    click: "click";
                    fill: "fill";
                    waitFor: "waitFor";
                    capture: "capture";
                }>;
                url: z.ZodOptional<z.ZodString>;
                selector: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodString>;
                dialog: z.ZodOptional<z.ZodEnum<{
                    accept: "accept";
                    dismiss: "dismiss";
                }>>;
            }, z.core.$strip>>;
            captureAfter: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    interfaceScan: z.ZodOptional<z.ZodObject<{
        clients: z.ZodDefault<z.ZodArray<z.ZodObject<{
            type: z.ZodString;
            protocol: z.ZodEnum<{
                file: "file";
                http: "http";
                ws: "ws";
                mq: "mq";
                socket: "socket";
                mail: "mail";
                "db-link": "db-link";
            }>;
            methods: z.ZodArray<z.ZodString>;
            endpointArg: z.ZodDefault<z.ZodNumber>;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    batchScan: z.ZodOptional<z.ZodObject<{
        ignoreSuspects: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$loose>;
export type Config = z.infer<typeof ConfigSchema>;
/** 기본 설정값(스키마 기본을 1회 평가하여 동결). */
export declare function defaultConfig(): Config;
/** 설정 파일 경로. */
export declare function configPath(projectRoot: string): string;
/** 설정 로드. 없으면 null. 깨졌으면 throw(조용한 기본값 대체 금지 — 정직성). */
export declare function loadConfig(projectRoot: string): Config | null;
/** 설정 기록(안정 들여쓰기 2칸, 후행 개행). */
export declare function writeConfig(projectRoot: string, config: Config): void;
//# sourceMappingURL=index.d.ts.map