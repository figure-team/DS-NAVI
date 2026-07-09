/**
 * NODE DETAIL 템플릿 (P2 도입, P4 계층별 분리) — step 노드 상세 섹션 정의.
 *
 * 플러그인 탑재 + 사람 편집 가능(방법론 템플릿과 동형). 템플릿이 **계층(FlowLayer)별로**
 * 상세 섹션을 정의하면 bundle 이 각 step 의 계층에 맞는 섹션(promptHint)을 호스트(Claude)
 * 에게 전달하고, 호스트는 섹션별 의미 주장을 근거(slice)와 함께 fill steps[].detail 에
 * 작성한다. verify/emit 은 섹션 주장을 도메인 주장과 동일하게 인용 기계검증한다.
 *
 * P4: api/service/dao/db/other(=unknown) 계층마다 다른 섹션 세트. role(역할)은 전 계층
 * 공통이되 promptHint 가 계층별로 다르고, 계층마다 시그니처 섹션 1개를 더 둔다.
 * 메서드·호출관계는 결정론(엔진이 calls 엣지로 보유)이라 템플릿 섹션이 아니다.
 */
import { z } from 'zod';
import type { FlowLayer } from './types.js';
export declare const NodeDetailSectionSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    promptHint: z.ZodString;
}, z.core.$strip>;
export type NodeDetailSection = z.infer<typeof NodeDetailSectionSchema>;
export declare const NodeDetailTemplateSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    byLayer: z.ZodObject<{
        api: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            promptHint: z.ZodString;
        }, z.core.$strip>>>;
        service: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            promptHint: z.ZodString;
        }, z.core.$strip>>>;
        dao: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            promptHint: z.ZodString;
        }, z.core.$strip>>>;
        db: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            promptHint: z.ZodString;
        }, z.core.$strip>>>;
        unknown: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            promptHint: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type NodeDetailTemplate = z.infer<typeof NodeDetailTemplateSchema>;
/**
 * v2 기본 템플릿 — 계층별 [role + 시그니처 섹션 1개]. 추후 사용자 커스텀 가능.
 * 각 섹션은 호스트가 step slice 를 근거로 채우는 의미 주장(인용 의무).
 */
export declare const DEFAULT_NODE_DETAIL_TEMPLATE: NodeDetailTemplate;
/** 파일명(확장자 제외) → 계층 키. other = unknown(코드 계층 열거형 매핑). */
export declare const LAYER_FILE_ALIAS: Record<string, FlowLayer>;
/**
 * **한 계층 템플릿 파일**(.md)의 섹션을 파싱한다. 계층마다 파일이 따로 있으므로
 * 파일 자체가 계층이고, 본문은 섹션 목록이다(비개발자 친화):
 *   `## <라벨> {#<id>}`  섹션 헤딩 (라벨=표시명, id=fill/detail 키)
 *   그 아래 본문          promptHint(LLM 채움 지시, 산문)
 * 결정론: 파일 순서 보존. 형식 오류는 **명확히 throw**(조용한 폴백 금지 — 정직성).
 * `## ` 앞의 제목(`#`)/설명(`>`) 프로즈는 무시한다.
 */
export declare function parseLayerSections(md: string): NodeDetailSection[];
/**
 * 계층별 템플릿 파일(.md) 내용을 모아 NodeDetailTemplate 로 조립·검증한다.
 * 입력 = { <계층>: 파일내용 } (IO 는 호출자/.mjs 가 — 엔진은 순수). 키는 FlowLayer
 * (파일명 other → unknown 은 호출자가 LAYER_FILE_ALIAS 로 매핑해 넘긴다).
 */
export declare function parseNodeDetailTemplate(filesByLayer: Partial<Record<FlowLayer, string>>): NodeDetailTemplate;
/**
 * 주어진 노드 계층에 적용되는 템플릿 섹션. 미정의 계층은 unknown(other) 폴백.
 * 결정론: 템플릿이 정의한 섹션 순서 보존(표시/채움 순서).
 */
export declare function sectionsForLayer(template: NodeDetailTemplate, layer: FlowLayer | undefined): NodeDetailSection[];
//# sourceMappingURL=node-template.d.ts.map