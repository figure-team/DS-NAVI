import { z } from 'zod';
import { type SkeletonReport, type UaGraphNode } from './types.js';
/** `.spec/map/fill/` 하위 디렉터리 이름. */
export declare const FILL_DIR = "fill";
export declare const CitationSchema: z.ZodObject<{
    filePath: z.ZodString;
    line: z.ZodNumber;
    snippet: z.ZodString;
}, z.core.$strip>;
export type Citation = z.infer<typeof CitationSchema>;
/** 사실 주장 — 텍스트 + 인용 의무(citations min 1). */
export declare const ClaimSchema: z.ZodObject<{
    text: z.ZodString;
    citations: z.ZodArray<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Claim = z.infer<typeof ClaimSchema>;
/**
 * P4(WORK_MAP §5): 업무 흐름도 노드 — work_flow.png 어휘(시작/종료/활동/판단).
 * activity/decision 은 사실 주장이라 인용 min 1(기존 규약), start/end 는 구조
 * 마커라 면제. flowRef 는 실존 flow id 검증(유령 참조 거부 — applyFills).
 */
export declare const BusinessFlowNodeSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        start: "start";
        end: "end";
        activity: "activity";
        decision: "decision";
    }>;
    label: z.ZodString;
    flowRef: z.ZodOptional<z.ZodString>;
    citations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type BusinessFlowNode = z.infer<typeof BusinessFlowNodeSchema>;
export declare const BusinessFlowEdgeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BusinessFlowEdge = z.infer<typeof BusinessFlowEdgeSchema>;
export declare const BusinessFlowSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            start: "start";
            end: "end";
            activity: "activity";
            decision: "decision";
        }>;
        label: z.ZodString;
        flowRef: z.ZodOptional<z.ZodString>;
        citations: z.ZodOptional<z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    edges: z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BusinessFlow = z.infer<typeof BusinessFlowSchema>;
/**
 * B안(복수화): 단위 업무 프로세스 순서도 1장 — title 필수(프로세스 이름은 업무
 * 언어, 예: "로그인", "주문 접수"). 명명이라 인용 면제(도메인 name 과 동일 규약).
 */
export declare const BusinessFlowProcessSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            start: "start";
            end: "end";
            activity: "activity";
            decision: "decision";
        }>;
        label: z.ZodString;
        flowRef: z.ZodOptional<z.ZodString>;
        citations: z.ZodOptional<z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    edges: z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    title: z.ZodString;
}, z.core.$strip>;
export type BusinessFlowProcess = z.infer<typeof BusinessFlowProcessSchema>;
/**
 * fill 의 업무 흐름도를 정규화한다 — 신형 `businessFlows[]`(title 필수)가 있으면
 * 그것을, 없으면 레거시 단수 `businessFlow` 를 title=null 1건 배열로. 반환의
 * 배열 인덱스가 검증 ref(`#businessFlow[<i>][<nodeId>]`)와 emit fillIndex 의
 * 기준이다(applyFills/verify/emit 3곳이 동일 기준을 공유해야 한다).
 */
export declare function normalizedBusinessFlows(fill: DomainFill): Array<{
    title: string | null;
    nodes: BusinessFlowNode[];
    edges: BusinessFlowEdge[];
}>;
export declare const DomainFillSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    domainId: z.ZodString;
    name: z.ZodString;
    summary: z.ZodObject<{
        text: z.ZodString;
        citations: z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    entities: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        citations: z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    businessRules: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        citations: z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    crossDomainInteractions: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        citations: z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    businessFlow: z.ZodOptional<z.ZodObject<{
        nodes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<{
                start: "start";
                end: "end";
                activity: "activity";
                decision: "decision";
            }>;
            label: z.ZodString;
            flowRef: z.ZodOptional<z.ZodString>;
            citations: z.ZodOptional<z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
        edges: z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    businessFlows: z.ZodOptional<z.ZodArray<z.ZodObject<{
        nodes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<{
                start: "start";
                end: "end";
                activity: "activity";
                decision: "decision";
            }>;
            label: z.ZodString;
            flowRef: z.ZodOptional<z.ZodString>;
            citations: z.ZodOptional<z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
        edges: z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        title: z.ZodString;
    }, z.core.$strip>>>;
    flows: z.ZodArray<z.ZodObject<{
        flowId: z.ZodString;
        name: z.ZodString;
        summary: z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodObject<{
        stepId: z.ZodString;
        name: z.ZodString;
        summary: z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DomainFill = z.infer<typeof DomainFillSchema>;
export interface RejectedItem {
    domainId: string;
    ref: string;
    reason: string;
    /** 기각 대상 종류 — 문자열 ref 접미 파싱 의존 제거(구조적 필터, 리뷰 C5). */
    kind: 'domain' | 'flow' | 'step' | 'businessFlow';
}
/**
 * P4: businessFlow 그래프 정합 검증(WORK_MAP §5) — 스키마 통과 후의 의미 검증.
 * 반환 = 위반 사유 목록(빈 배열 = 정합). 하나라도 있으면 해당 도메인의 businessFlow
 * 만 기각한다(도메인 fill 전체 기각 아님).
 *
 * 규칙: 중복 노드 id · 엣지 끝점 실존 · 고아 노드(어느 엣지에도 닿지 않음) ·
 * start/end 각 1개 이상 · flowRef 는 이 도메인의 실존 flow id(유령 참조 거부) ·
 * **decision 은 나가는 엣지 2개 이상 + 나가는 엣지 전부 분기 라벨 필수**(분기 없는
 * 판단은 AC-4 "분기 포함 순서도"의 약속 위반 — 리뷰 C1/C7). 사이클(재시도 루프)은
 * 의도적으로 허용한다.
 */
export declare function validateBusinessFlow(bf: BusinessFlow, domainFlowIds: ReadonlySet<string>): string[];
/** `.spec/map/fill/` 디렉터리 경로. */
export declare function fillDir(projectRoot: string): string;
/** 도메인 key 에 대응하는 fill 파일의 절대 경로. */
export declare function fillPathFor(projectRoot: string, key: string): string;
/**
 * fill/*.json 읽기 — 파일 없음은 그 도메인만 "pending"(실패 도메인만 재시도, 멱등),
 * 파싱/스키마/domainId 불일치는 "invalid"(재생성 대상)로 남긴다.
 */
export declare function readFills(projectRoot: string, skeleton: SkeletonReport): Promise<{
    fills: DomainFill[];
    pending: string[];
    invalid: Array<{
        key: string;
        error: string;
    }>;
}>;
/**
 * fill 을 skeleton 노드에 적용 — 구조 read-only.
 * 반환 노드는 복사본이다(skeleton 불변). 모르는 flowId/stepId, 도메인 밖 ID 는
 * 항목 단위 기각으로 보고된다(조용한 누락 금지). 인용은 domainMeta.ktdsClaims
 * (passthrough)로 동봉되어 검증기(S9)와 문서 렌더가 근거를 읽는다 — U-A 스키마의
 * string[] domainMeta 필드(entities 등)에는 텍스트만 남긴다.
 */
export declare function applyFills(skeleton: SkeletonReport, fills: DomainFill[]): {
    nodes: UaGraphNode[];
    rejected: RejectedItem[];
};
/** 채움이 안 된(= 여전히 빈 summary) 노드 id 목록 — 디스패치 진행률 표시용. */
export declare function unfilledNodes(nodes: UaGraphNode[]): string[];
//# sourceMappingURL=fill.d.ts.map