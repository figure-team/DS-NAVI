/**
 * domain-map 데이터 계약(zod 스키마 + z.infer 타입).
 *
 * census(파일 인구조사)와 routes(라우트/배치 추출) 산출물의 단일 소스.
 * 블루프린트 관측 동작과 골든 등가: 스키마 버전·필드명·열거값을 핀.
 * 모든 산출 배열은 생산자에서 명시 키로 정렬되어 결정론을 보장한다.
 */
import { z } from 'zod';
/** census.json — 프로젝트 파일 인구조사. */
export declare const CensusReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    fileCount: z.ZodNumber;
    files: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        lang: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CensusReport = z.infer<typeof CensusReportSchema>;
/** HTTP 메서드 — ANY 는 메서드 미특정(매핑 전체 수용). */
export declare const RouteMethodSchema: z.ZodEnum<{
    GET: "GET";
    POST: "POST";
    PUT: "PUT";
    DELETE: "DELETE";
    PATCH: "PATCH";
    HEAD: "HEAD";
    OPTIONS: "OPTIONS";
    ANY: "ANY";
}>;
export type RouteMethod = z.infer<typeof RouteMethodSchema>;
/** 라우트 종류 — api(데이터) / form(뷰 제출) / page(렌더) / servlet(레거시). */
export declare const RouteKindSchema: z.ZodEnum<{
    api: "api";
    form: "form";
    page: "page";
    servlet: "servlet";
}>;
export type RouteKind = z.infer<typeof RouteKindSchema>;
/** 라우트 프레임워크. */
export declare const RouteFrameworkSchema: z.ZodEnum<{
    spring: "spring";
    stripes: "stripes";
    webxml: "webxml";
    jsp: "jsp";
    nextjs: "nextjs";
}>;
export type RouteFramework = z.infer<typeof RouteFrameworkSchema>;
/** 단일 라우트 엔트리. */
export declare const RouteEntrySchema: z.ZodObject<{
    routeId: z.ZodString;
    method: z.ZodEnum<{
        GET: "GET";
        POST: "POST";
        PUT: "PUT";
        DELETE: "DELETE";
        PATCH: "PATCH";
        HEAD: "HEAD";
        OPTIONS: "OPTIONS";
        ANY: "ANY";
    }>;
    path: z.ZodString;
    rawPath: z.ZodString;
    kind: z.ZodEnum<{
        api: "api";
        form: "form";
        page: "page";
        servlet: "servlet";
    }>;
    framework: z.ZodEnum<{
        spring: "spring";
        stripes: "stripes";
        webxml: "webxml";
        jsp: "jsp";
        nextjs: "nextjs";
    }>;
    filePath: z.ZodString;
    line: z.ZodNumber;
    handler: z.ZodNullable<z.ZodString>;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type RouteEntry = z.infer<typeof RouteEntrySchema>;
/** 배치/스케줄 진입점 엔트리. */
export declare const BatchEntrySchema: z.ZodObject<{
    entryId: z.ZodString;
    trigger: z.ZodEnum<{
        scheduled: "scheduled";
        quartz: "quartz";
        "task-xml": "task-xml";
        main: "main";
        "spring-batch": "spring-batch";
        "quartz-java": "quartz-java";
        executor: "executor";
        timer: "timer";
        shell: "shell";
        crontab: "crontab";
    }>;
    schedule: z.ZodNullable<z.ZodString>;
    filePath: z.ZodString;
    line: z.ZodNumber;
    handler: z.ZodNullable<z.ZodString>;
    notes: z.ZodArray<z.ZodString>;
    handlerFile: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type BatchEntry = z.infer<typeof BatchEntrySchema>;
/** routes.json — 라우트/배치 추출 산출물. */
export declare const RoutesReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    contextPath: z.ZodNullable<z.ZodString>;
    routes: z.ZodArray<z.ZodObject<{
        routeId: z.ZodString;
        method: z.ZodEnum<{
            GET: "GET";
            POST: "POST";
            PUT: "PUT";
            DELETE: "DELETE";
            PATCH: "PATCH";
            HEAD: "HEAD";
            OPTIONS: "OPTIONS";
            ANY: "ANY";
        }>;
        path: z.ZodString;
        rawPath: z.ZodString;
        kind: z.ZodEnum<{
            api: "api";
            form: "form";
            page: "page";
            servlet: "servlet";
        }>;
        framework: z.ZodEnum<{
            spring: "spring";
            stripes: "stripes";
            webxml: "webxml";
            jsp: "jsp";
            nextjs: "nextjs";
        }>;
        filePath: z.ZodString;
        line: z.ZodNumber;
        handler: z.ZodNullable<z.ZodString>;
        notes: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    batchEntries: z.ZodArray<z.ZodObject<{
        entryId: z.ZodString;
        trigger: z.ZodEnum<{
            scheduled: "scheduled";
            quartz: "quartz";
            "task-xml": "task-xml";
            main: "main";
            "spring-batch": "spring-batch";
            "quartz-java": "quartz-java";
            executor: "executor";
            timer: "timer";
            shell: "shell";
            crontab: "crontab";
        }>;
        schedule: z.ZodNullable<z.ZodString>;
        filePath: z.ZodString;
        line: z.ZodNumber;
        handler: z.ZodNullable<z.ZodString>;
        notes: z.ZodArray<z.ZodString>;
        handlerFile: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type RoutesReport = z.infer<typeof RoutesReportSchema>;
/**
 * 엣지 종류 — 파일↔파일 의존을 한정한다.
 * import(import 문) / injection(@Autowired·@Resource·@Inject) / field-type(평범한 필드 타입) /
 * ctor-param(생성자 파라미터 타입) / extends / implements / impl(인터페이스→구현) /
 * mybatis(SqlSession 문자열 호출→매퍼) / mapper-xml(매퍼 인터페이스→매퍼 XML).
 */
export declare const EdgeKindSchema: z.ZodEnum<{
    import: "import";
    injection: "injection";
    "field-type": "field-type";
    "ctor-param": "ctor-param";
    extends: "extends";
    implements: "implements";
    impl: "impl";
    mybatis: "mybatis";
    "mapper-xml": "mapper-xml";
}>;
export type EdgeKind = z.infer<typeof EdgeKindSchema>;
/** 단일 엣지 — source/target 은 census relPath. */
export declare const EdgeRecordSchema: z.ZodObject<{
    source: z.ZodString;
    target: z.ZodString;
    kind: z.ZodEnum<{
        import: "import";
        injection: "injection";
        "field-type": "field-type";
        "ctor-param": "ctor-param";
        extends: "extends";
        implements: "implements";
        impl: "impl";
        mybatis: "mybatis";
        "mapper-xml": "mapper-xml";
    }>;
    line: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type EdgeRecord = z.infer<typeof EdgeRecordSchema>;
/** 미해소 참조 — 절대 조용히 누락하지 않는다(ambiguous=다중후보 / not-found=후보없음). */
export declare const UnresolvedSchema: z.ZodObject<{
    source: z.ZodString;
    ref: z.ZodString;
    reason: z.ZodEnum<{
        ambiguous: "ambiguous";
        "not-found": "not-found";
    }>;
}, z.core.$strip>;
export type Unresolved = z.infer<typeof UnresolvedSchema>;
/** edges.json — 파일 의존 엣지 산출물. */
export declare const EdgesReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    edges: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        kind: z.ZodEnum<{
            import: "import";
            injection: "injection";
            "field-type": "field-type";
            "ctor-param": "ctor-param";
            extends: "extends";
            implements: "implements";
            impl: "impl";
            mybatis: "mybatis";
            "mapper-xml": "mapper-xml";
        }>;
        line: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    unresolved: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        ref: z.ZodString;
        reason: z.ZodEnum<{
            ambiguous: "ambiguous";
            "not-found": "not-found";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EdgesReport = z.infer<typeof EdgesReportSchema>;
/** 단일 슬라이스 — 루트에서 도달 가능한 파일 집합. */
export declare const SliceRecordSchema: z.ZodObject<{
    root: z.ZodString;
    entryIds: z.ZodArray<z.ZodString>;
    reached: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type SliceRecord = z.infer<typeof SliceRecordSchema>;
/** 파일 소유권 — sole(단독)/shared(공유)/unreached(미도달). */
export declare const OwnershipSchema: z.ZodObject<{
    relPath: z.ZodString;
    status: z.ZodEnum<{
        sole: "sole";
        shared: "shared";
        unreached: "unreached";
    }>;
    owners: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type Ownership = z.infer<typeof OwnershipSchema>;
/** slices.json — 슬라이스/소유권 산출물. */
export declare const SlicesReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    depthCap: z.ZodNumber;
    slices: z.ZodArray<z.ZodObject<{
        root: z.ZodString;
        entryIds: z.ZodArray<z.ZodString>;
        reached: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    ownership: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        status: z.ZodEnum<{
            sole: "sole";
            shared: "shared";
            unreached: "unreached";
        }>;
        owners: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SlicesReport = z.infer<typeof SlicesReportSchema>;
/**
 * 계층(layer) — ground-truth 신호로 동적 추론(하드코딩 4계층 아님, AC-2).
 * 신호가 없으면 'unknown'(정직성: 조용히 끼워맞추지 않음).
 */
export declare const FlowLayerSchema: z.ZodEnum<{
    unknown: "unknown";
    api: "api";
    service: "service";
    dao: "dao";
    db: "db";
}>;
export type FlowLayer = z.infer<typeof FlowLayerSchema>;
/**
 * 후보 파일에 도메인이 부여된 신호 출처.
 * reachability(도달성, 주) > directory(디렉토리, 교차검증) > prefix(파일명, 폴백).
 */
export declare const DomainViaSchema: z.ZodEnum<{
    reachability: "reachability";
    directory: "directory";
    prefix: "prefix";
}>;
export type DomainVia = z.infer<typeof DomainViaSchema>;
/** 후보 도메인 1건의 파일 멤버 — relPath + 부여 신호. */
export declare const DomainFileSchema: z.ZodObject<{
    relPath: z.ZodString;
    via: z.ZodEnum<{
        reachability: "reachability";
        directory: "directory";
        prefix: "prefix";
    }>;
}, z.core.$strip>;
export type DomainFile = z.infer<typeof DomainFileSchema>;
/**
 * 도메인 키 증거 확신도 — high(디렉터리 토큰 정합) > medium(접두어 분할) > low(폴백).
 * low 시드는 상위 신호 도메인이 존재하면 자기 도메인을 만들지 않고 격리된다(quarantined).
 */
export declare const DomainConfidenceSchema: z.ZodEnum<{
    high: "high";
    medium: "medium";
    low: "low";
}>;
export type DomainConfidence = z.infer<typeof DomainConfidenceSchema>;
/** 단일 도메인 후보 — key 는 불변(다운스트림 skeleton 의 닻). */
export declare const DomainCandidateSchema: z.ZodObject<{
    key: z.ZodString;
    roots: z.ZodArray<z.ZodString>;
    entryCount: z.ZodNumber;
    files: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        via: z.ZodEnum<{
            reachability: "reachability";
            directory: "directory";
            prefix: "prefix";
        }>;
    }, z.core.$strip>>;
    confidence: z.ZodOptional<z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>>;
}, z.core.$strip>;
export type DomainCandidate = z.infer<typeof DomainCandidateSchema>;
/**
 * candidates.json — 결정론적 도메인 분류(S4-5) 산출물.
 * 신호 우선순위: 도달성 > 디렉토리 > prefix. 모호/공용/미해소는 절대 누락하지 않는다.
 */
export declare const CandidatesReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    directoryDegenerate: z.ZodNullable<z.ZodObject<{
        reason: z.ZodEnum<{
            "too-few-clusters": "too-few-clusters";
            "single-cluster-concentration": "single-cluster-concentration";
        }>;
    }, z.core.$strip>>;
    candidates: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        roots: z.ZodArray<z.ZodString>;
        entryCount: z.ZodNumber;
        files: z.ZodArray<z.ZodObject<{
            relPath: z.ZodString;
            via: z.ZodEnum<{
                reachability: "reachability";
                directory: "directory";
                prefix: "prefix";
            }>;
        }, z.core.$strip>>;
        confidence: z.ZodOptional<z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>>;
    }, z.core.$strip>>;
    common: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        owners: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    ambiguous: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        reachKey: z.ZodString;
        directoryKey: z.ZodString;
    }, z.core.$strip>>;
    unresolved: z.ZodArray<z.ZodString>;
    quarantined: z.ZodOptional<z.ZodArray<z.ZodObject<{
        root: z.ZodString;
        key: z.ZodString;
        reason: z.ZodEnum<{
            "weak-signal": "weak-signal";
        }>;
    }, z.core.$strip>>>;
    conventionPrefixes: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CandidatesReport = z.infer<typeof CandidatesReportSchema>;
/**
 * 사람 게이트 보정 연산(ops) — confirm --ops <file> 로 자동 플랜 위에 결정론 적용.
 * merge(도메인 병합) / move(루트 이동) / exclude(도메인 제외) / rename(표시명 개명).
 * ops 파일을 .spec/map/ 에 두고 재실행하면 사람 결정이 그대로 재생된다(결정론 닻).
 */
export declare const PlanOpSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    op: z.ZodLiteral<"merge">;
    from: z.ZodString;
    into: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"move">;
    root: z.ZodString;
    to: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"exclude">;
    key: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"rename">;
    key: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>], "op">;
export type PlanOp = z.infer<typeof PlanOpSchema>;
export declare const PlanOpsSchema: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    op: z.ZodLiteral<"merge">;
    from: z.ZodString;
    into: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"move">;
    root: z.ZodString;
    to: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"exclude">;
    key: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"rename">;
    key: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>], "op">>;
/** 확정된 단일 도메인 — key 는 불변, name 은 표시용(개명 가능). */
export declare const ConfirmedDomainSchema: z.ZodObject<{
    key: z.ZodString;
    name: z.ZodString;
    roots: z.ZodArray<z.ZodString>;
    aliasKeys: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ConfirmedDomain = z.infer<typeof ConfirmedDomainSchema>;
/**
 * domain-plan.confirmed.json — 사람 게이트(S7) 결정의 영속화.
 * 재실행 결정론의 닻이다. 모든 배열은 정렬되어 byte-identical 을 보장한다.
 */
export declare const ConfirmedPlanSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    decidedBy: z.ZodString;
    domains: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        name: z.ZodString;
        roots: z.ZodArray<z.ZodString>;
        aliasKeys: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    excludedKeys: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ConfirmedPlan = z.infer<typeof ConfirmedPlanSchema>;
/** SKELETON 의 비어 있는 의미 필드 — S8 LLM 채움 전까지 name/summary 는 공란. */
export declare const SKELETON_BLANK: "";
/** flow 당 step 상한 — 초과분은 truncatedSteps 로 보고(조용한 누락 금지). */
export declare const DEFAULT_STEP_CAP = 8;
/** 그래프 노드 종류. */
export declare const UaGraphNodeTypeSchema: z.ZodEnum<{
    domain: "domain";
    flow: "flow";
    step: "step";
}>;
export type UaGraphNodeType = z.infer<typeof UaGraphNodeTypeSchema>;
/** 복잡도 등급 — 멤버 수/step 수 기반 결정론적 임계값. */
export declare const UaComplexitySchema: z.ZodEnum<{
    simple: "simple";
    moderate: "moderate";
    complex: "complex";
}>;
export type UaComplexity = z.infer<typeof UaComplexitySchema>;
/** U-A domain-graph 호환 노드(domain/flow/step). name/summary 는 SKELETON_BLANK 로 시작. */
export declare const UaGraphNodeSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        domain: "domain";
        flow: "flow";
        step: "step";
    }>;
    name: z.ZodString;
    filePath: z.ZodOptional<z.ZodString>;
    lineRange: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    summary: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    complexity: z.ZodEnum<{
        simple: "simple";
        moderate: "moderate";
        complex: "complex";
    }>;
    domainMeta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    layer: z.ZodOptional<z.ZodEnum<{
        unknown: "unknown";
        api: "api";
        service: "service";
        dao: "dao";
        db: "db";
    }>>;
}, z.core.$strip>;
export type UaGraphNode = z.infer<typeof UaGraphNodeSchema>;
/** 그래프 엣지 종류 — contains_flow(도메인→흐름)/flow_step(흐름→단계)/calls(단계→단계). */
export declare const UaGraphEdgeTypeSchema: z.ZodEnum<{
    contains_flow: "contains_flow";
    flow_step: "flow_step";
    calls: "calls";
}>;
export type UaGraphEdgeType = z.infer<typeof UaGraphEdgeTypeSchema>;
/** U-A domain-graph 호환 엣지. weight 는 flow_step 의 단조 진행도(마지막≈1). */
export declare const UaGraphEdgeSchema: z.ZodObject<{
    source: z.ZodString;
    target: z.ZodString;
    type: z.ZodEnum<{
        contains_flow: "contains_flow";
        flow_step: "flow_step";
        calls: "calls";
    }>;
    weight: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type UaGraphEdge = z.infer<typeof UaGraphEdgeSchema>;
/** step 노드의 근거 출처 — 인용 검증(S9)·문서화의 닻. */
export declare const StepSourceSchema: z.ZodObject<{
    stepId: z.ZodString;
    relPath: z.ZodString;
    line: z.ZodNumber;
    className: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type StepSource = z.infer<typeof StepSourceSchema>;
/**
 * skeleton.json — S6 결정론 골격 산출물.
 * 모든 배열은 자연키로 정렬되어 byte-identical 재실행을 보장한다.
 * truncatedSteps 는 stepCap 초과로 누락된 step 을 정직하게 보고한다(조용한 cap 금지).
 */
export declare const SkeletonReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    stepCap: z.ZodNumber;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            domain: "domain";
            flow: "flow";
            step: "step";
        }>;
        name: z.ZodString;
        filePath: z.ZodOptional<z.ZodString>;
        lineRange: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        summary: z.ZodString;
        tags: z.ZodArray<z.ZodString>;
        complexity: z.ZodEnum<{
            simple: "simple";
            moderate: "moderate";
            complex: "complex";
        }>;
        domainMeta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        layer: z.ZodOptional<z.ZodEnum<{
            unknown: "unknown";
            api: "api";
            service: "service";
            dao: "dao";
            db: "db";
        }>>;
    }, z.core.$strip>>;
    edges: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<{
            contains_flow: "contains_flow";
            flow_step: "flow_step";
            calls: "calls";
        }>;
        weight: z.ZodOptional<z.ZodNumber>;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    stepSources: z.ZodArray<z.ZodObject<{
        stepId: z.ZodString;
        relPath: z.ZodString;
        line: z.ZodNumber;
        className: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    truncatedSteps: z.ZodArray<z.ZodObject<{
        flowId: z.ZodString;
        dropped: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SkeletonReport = z.infer<typeof SkeletonReportSchema>;
/**
 * 교차 도메인 엣지 1건의 근거 — 집계 이전의 실제 파일 의존 엣지.
 * source/target 은 census relPath, kind 는 EdgeKind 문자열, line 은 선언 라인(없으면 null).
 */
export declare const CrossDomainEvidenceSchema: z.ZodObject<{
    source: z.ZodString;
    target: z.ZodString;
    kind: z.ZodString;
    line: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type CrossDomainEvidence = z.infer<typeof CrossDomainEvidenceSchema>;
/** 교차 도메인 엣지 — from→to 도메인, weight=근거 엣지 수, evidence=근거 파일 엣지. */
export declare const CrossDomainEdgeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    weight: z.ZodNumber;
    evidence: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        kind: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CrossDomainEdge = z.infer<typeof CrossDomainEdgeSchema>;
/**
 * 교차 도메인 의존 그래프(E-c, AC-33).
 * 자기 도메인(self) 엣지는 제외, (from,to) 정렬. 모든 엣지는 grounded(근거 보유).
 */
export declare const CrossDomainGraphSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    edges: z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        weight: z.ZodNumber;
        evidence: z.ZodArray<z.ZodObject<{
            source: z.ZodString;
            target: z.ZodString;
            kind: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CrossDomainGraph = z.infer<typeof CrossDomainGraphSchema>;
/**
 * 도메인 온보딩 우선순위(E-b, AC-32).
 * priorityScore = 복잡도·크기·결합도의 결정론 가중합(고정 정수 가중치, 문서화됨).
 * rank 는 (priorityScore DESC, key ASC) 정렬의 1-based 위치(결정론 tie-break).
 */
export declare const DomainPrioritySchema: z.ZodObject<{
    key: z.ZodString;
    sizeScore: z.ZodNumber;
    complexityScore: z.ZodNumber;
    couplingScore: z.ZodNumber;
    priorityScore: z.ZodNumber;
    rank: z.ZodNumber;
}, z.core.$strip>;
export type DomainPriority = z.infer<typeof DomainPrioritySchema>;
/** 도메인 맵 요약의 단일 도메인 행(AC-3). */
export declare const DomainMapSummaryDomainSchema: z.ZodObject<{
    key: z.ZodString;
    name: z.ZodString;
    flowCount: z.ZodNumber;
    nodeCount: z.ZodNumber;
    priorityScore: z.ZodNumber;
    rank: z.ZodNumber;
    grounded: z.ZodBoolean;
    sampleAnchors: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DomainMapSummaryDomain = z.infer<typeof DomainMapSummaryDomainSchema>;
/**
 * domain-map.json — AC-3 도메인 맵 요약 산출물.
 * 확정 플랜 표시명 + flow/node 집계 + grounded(앵커 완비 여부) + 우선순위 + 교차도메인.
 * 모든 배열은 정렬되어 byte-identical 재실행을 보장한다.
 */
export declare const DomainMapSummarySchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    domains: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        name: z.ZodString;
        flowCount: z.ZodNumber;
        nodeCount: z.ZodNumber;
        priorityScore: z.ZodNumber;
        rank: z.ZodNumber;
        grounded: z.ZodBoolean;
        sampleAnchors: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    crossDomain: z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        gitCommit: z.ZodNullable<z.ZodString>;
        edges: z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            weight: z.ZodNumber;
            evidence: z.ZodArray<z.ZodObject<{
                source: z.ZodString;
                target: z.ZodString;
                kind: z.ZodString;
                line: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    planDrift: z.ZodOptional<z.ZodObject<{
        addedRoots: z.ZodArray<z.ZodString>;
        removedRoots: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DomainMapSummary = z.infer<typeof DomainMapSummarySchema>;
/**
 * 호출 수신자 해소 종류 — 8 receiver kinds + unresolved.
 *   field       : `this.svc.go()` / `svc.go()` (svc=필드) -> 필드 선언 타입.
 *   param       : `p.go()` (p=메서드 파라미터) -> 파라미터 선언 타입.
 *   local       : `Foo x = new Foo(); x.go()` -> 지역변수 선언/추론 타입.
 *   self        : `go()` / `this.go()` (수신자 없음) -> 외곽 클래스(+상위).
 *   super       : `super.go()` -> 슈퍼클래스.
 *   static      : `Foo.go()` (Foo=타입명) -> 타입 Foo 의 정적 메서드.
 *   return-type : `a.b().c()` -> `b()` 의 반환 타입 -> 그 타입의 `.c()`.
 *   external    : 수신자가 JDK/라이브러리 타입(java.* 등, 프로젝트 내 선언 없음).
 *   unresolved  : 해소 불가(람다/캐스트/추론불가 var 등) — 보고, 절대 누락 금지.
 */
export declare const ReceiverKindSchema: z.ZodEnum<{
    unresolved: "unresolved";
    field: "field";
    param: "param";
    local: "local";
    self: "self";
    super: "super";
    static: "static";
    "return-type": "return-type";
    external: "external";
}>;
export type ReceiverKind = z.infer<typeof ReceiverKindSchema>;
/**
 * 해소된 단일 호출 — caller(메서드)에서 callee(메서드)로의 메서드 단위 엣지.
 * calleeClass/calleeFile 은 external/unresolved 시 null(보고하되 드롭하지 않음).
 * overloadArity: 동명 오버로드를 argCount 로 선택했을 때 고른 오버로드의 파라미터 수.
 *   - 정확 일치 1건  -> 그 파라미터 수.
 *   - 후보 0/모호    -> null(정직성: 임의 선택 금지).
 */
export declare const ResolvedCallSchema: z.ZodObject<{
    callerClass: z.ZodString;
    callerMethod: z.ZodString;
    callerFile: z.ZodString;
    callLine: z.ZodNumber;
    calleeClass: z.ZodNullable<z.ZodString>;
    calleeMethod: z.ZodString;
    calleeFile: z.ZodNullable<z.ZodString>;
    receiverKind: z.ZodEnum<{
        unresolved: "unresolved";
        field: "field";
        param: "param";
        local: "local";
        self: "self";
        super: "super";
        static: "static";
        "return-type": "return-type";
        external: "external";
    }>;
    argCount: z.ZodNumber;
    overloadArity: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type ResolvedCall = z.infer<typeof ResolvedCallSchema>;
/**
 * method-calls.json — 메서드 단위 호출 그래프 산출물.
 * calls 는 (callerFile, callLine, calleeMethod) 자연키 정렬 — byte-identical 재실행 보장.
 */
export declare const MethodCallGraphSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    calls: z.ZodArray<z.ZodObject<{
        callerClass: z.ZodString;
        callerMethod: z.ZodString;
        callerFile: z.ZodString;
        callLine: z.ZodNumber;
        calleeClass: z.ZodNullable<z.ZodString>;
        calleeMethod: z.ZodString;
        calleeFile: z.ZodNullable<z.ZodString>;
        receiverKind: z.ZodEnum<{
            unresolved: "unresolved";
            field: "field";
            param: "param";
            local: "local";
            self: "self";
            super: "super";
            static: "static";
            "return-type": "return-type";
            external: "external";
        }>;
        argCount: z.ZodNumber;
        overloadArity: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type MethodCallGraph = z.infer<typeof MethodCallGraphSchema>;
/** LLM 도메인명 제안 컨텍스트의 단일 도메인(E-a, AC-31). */
export declare const NameSuggestionDomainSchema: z.ZodObject<{
    key: z.ZodString;
    currentName: z.ZodString;
    sampleFiles: z.ZodArray<z.ZodString>;
    tokens: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type NameSuggestionDomain = z.infer<typeof NameSuggestionDomainSchema>;
/**
 * LLM 도메인명 제안 컨텍스트(E-a, AC-31).
 * 엔진은 LLM 을 호출하지 않는다 — HOST LLM 이 한국어 이름을 제안할 컨텍스트만 만든다.
 * 적용은 confirm.renameDomain(plan,key,name) 으로(key 불변).
 */
export declare const NameSuggestionContextSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    domains: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        currentName: z.ZodString;
        sampleFiles: z.ZodArray<z.ZodString>;
        tokens: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type NameSuggestionContext = z.infer<typeof NameSuggestionContextSchema>;
//# sourceMappingURL=types.d.ts.map