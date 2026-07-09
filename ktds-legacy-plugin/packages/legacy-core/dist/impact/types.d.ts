/**
 * /understand-impact 산출물 계약(zod 스키마 + z.infer 타입) — Component 4.
 *
 * 엔진 출력 `impact.json` 은 소비하는 `/understand-map` 산출물 옆 `.spec/map/` 에 산다.
 *
 * 결정론 계약(domain-map/types.ts 와 동형): 동일 commit + 동일 seeds 면 byte-identical.
 * → 타임스탬프 없음, 순회 순서 파생 순번 없음, 키 순서 고정, 모든 배열은 명시 키 정렬.
 * host(LLM) 산문/표 인용은 ImpactResult 에 들어가지 않는다(발행 시점에만 합류).
 *
 * 신뢰도 단일 소스: `../types.js` 의 CONFIDENCE_VALUES
 * (CONFIRMED/CONFIRMED_AI/INFERRED/UNVERIFIED). 블루프린트의 NEEDS_REVIEW 는
 * 본 fork 에서 UNVERIFIED 로 매핑한다(사람 확정은 doc-state 로). 중복 정의 금지.
 */
import { z } from 'zod';
import { type EdgeKind } from '../domain-map/types.js';
export declare const IMPACT_REPORT_FILENAME = "impact.json";
/** Confidence 는 CONFIDENCE_VALUES 단일 소스에서 파생(수동 동기화 제거). */
export declare const ImpactConfidenceSchema: z.ZodEnum<{
    CONFIRMED: "CONFIRMED";
    CONFIRMED_AI: "CONFIRMED_AI";
    INFERRED: "INFERRED";
    UNVERIFIED: "UNVERIFIED";
}>;
/**
 * 기본 역방향 도달성 엣지 필터 = `import` 를 제외한 모든 구조 엣지 종류.
 * 상수-only `import x.Y;` 는 종이상 의존이나 런타임 호출이 아니라 역방향 영향
 * 집합을 부풀린다 → 기본 제외. `field-type` 은 IN(타입 T 필드 보유는 진짜 구조
 * 의존). hub 폭발은 fanInThreshold 로 별도 제어, `import` 는 옵트인 가능.
 */
export declare const STRONG_EDGE_KINDS: readonly EdgeKind[];
export declare const DEFAULT_IMPACT_DEPTH_CAP = 12;
export declare const DEFAULT_FAN_IN_THRESHOLD = 24;
export declare const ImpactOptionsSchema: z.ZodObject<{
    depthCap: z.ZodDefault<z.ZodNumber>;
    edgeKinds: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        import: "import";
        injection: "injection";
        "field-type": "field-type";
        "ctor-param": "ctor-param";
        extends: "extends";
        implements: "implements";
        impl: "impl";
        mybatis: "mybatis";
        "mapper-xml": "mapper-xml";
    }>>>;
    fanInThreshold: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ImpactOptions = z.infer<typeof ImpactOptionsSchema>;
export declare const SEED_ORIGINS: readonly ["path", "nl", "route", "domain"];
export declare const ImpactSeedSchema: z.ZodObject<{
    relPath: z.ZodString;
    origin: z.ZodEnum<{
        path: "path";
        domain: "domain";
        nl: "nl";
        route: "route";
    }>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type ImpactSeed = z.infer<typeof ImpactSeedSchema>;
export declare const ImpactCitationSchema: z.ZodObject<{
    filePath: z.ZodString;
    line: z.ZodNumber;
    snippet: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ImpactCitation = z.infer<typeof ImpactCitationSchema>;
export declare const AffectedFileSchema: z.ZodObject<{
    relPath: z.ZodString;
    viaKinds: z.ZodArray<z.ZodEnum<{
        import: "import";
        injection: "injection";
        "field-type": "field-type";
        "ctor-param": "ctor-param";
        extends: "extends";
        implements: "implements";
        impl: "impl";
        mybatis: "mybatis";
        "mapper-xml": "mapper-xml";
    }>>;
    minDepth: z.ZodNumber;
    citation: z.ZodNullable<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AffectedFile = z.infer<typeof AffectedFileSchema>;
export declare const API_IMPACT_VIA: readonly ["ownership", "reverse", "both"];
export declare const ApiImpactSchema: z.ZodObject<{
    targetKind: z.ZodEnum<{
        batch: "batch";
        route: "route";
    }>;
    id: z.ZodString;
    filePath: z.ZodString;
    line: z.ZodNumber;
    handler: z.ZodNullable<z.ZodString>;
    via: z.ZodEnum<{
        ownership: "ownership";
        reverse: "reverse";
        both: "both";
    }>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type ApiImpact = z.infer<typeof ApiImpactSchema>;
export declare const PersistenceMapperSchema: z.ZodObject<{
    relPath: z.ZodString;
    namespace: z.ZodNullable<z.ZodString>;
    owners: z.ZodArray<z.ZodString>;
    citation: z.ZodNullable<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PersistenceMapper = z.infer<typeof PersistenceMapperSchema>;
export declare const PersistenceSqlFileSchema: z.ZodObject<{
    relPath: z.ZodString;
    lang: z.ZodString;
}, z.core.$strip>;
/** host-fill 닻: host 가 테이블/컬럼 인용을 추출할 SQL 슬라이스 위치. */
export declare const TableCandidateSlotSchema: z.ZodObject<{
    mapperRelPath: z.ZodString;
    sqlSlice: z.ZodObject<{
        filePath: z.ZodString;
        startLine: z.ZodNumber;
        endLine: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type TableCandidateSlot = z.infer<typeof TableCandidateSlotSchema>;
/** KG table 노드 카탈로그(host-추출 테이블명의 DDL 근거 닻). */
export declare const KgTableEntrySchema: z.ZodObject<{
    name: z.ZodString;
    filePath: z.ZodString;
    startLine: z.ZodNullable<z.ZodNumber>;
    endLine: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type KgTableEntry = z.infer<typeof KgTableEntrySchema>;
/**
 * JPA entity↔table 영향(보완 B, AC-16). MyBatis Mapper-XML 대신 @Entity/@Table 애너테이션
 * 경로로 file:line grounding. 명시 @Table = CONFIRMED, 암묵 명명전략 = INFERRED([추정]).
 */
export declare const JpaTableImpactSchema: z.ZodObject<{
    entityClass: z.ZodString;
    relPath: z.ZodString;
    tableName: z.ZodString;
    tableExplicit: z.ZodBoolean;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
    citation: z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    columns: z.ZodArray<z.ZodObject<{
        column: z.ZodString;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
        line: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JpaTableImpact = z.infer<typeof JpaTableImpactSchema>;
export declare const PersistenceImpactSchema: z.ZodObject<{
    mappers: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        namespace: z.ZodNullable<z.ZodString>;
        owners: z.ZodArray<z.ZodString>;
        citation: z.ZodNullable<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    sqlFiles: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        lang: z.ZodString;
    }, z.core.$strip>>;
    tableCandidateSlots: z.ZodArray<z.ZodObject<{
        mapperRelPath: z.ZodString;
        sqlSlice: z.ZodObject<{
            filePath: z.ZodString;
            startLine: z.ZodNumber;
            endLine: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    kgTableCatalog: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        filePath: z.ZodString;
        startLine: z.ZodNullable<z.ZodNumber>;
        endLine: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    jpaTables: z.ZodDefault<z.ZodArray<z.ZodObject<{
        entityClass: z.ZodString;
        relPath: z.ZodString;
        tableName: z.ZodString;
        tableExplicit: z.ZodBoolean;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
        citation: z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        columns: z.ZodArray<z.ZodObject<{
            column: z.ZodString;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
            line: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    note: z.ZodString;
}, z.core.$strip>;
export type PersistenceImpact = z.infer<typeof PersistenceImpactSchema>;
export declare const FLOW_IMPACT_VIA: readonly ["step", "ownership-fallback"];
export declare const FlowImpactSchema: z.ZodObject<{
    flowId: z.ZodString;
    routeId: z.ZodNullable<z.ZodString>;
    domainId: z.ZodNullable<z.ZodString>;
    domainKey: z.ZodNullable<z.ZodString>;
    domainName: z.ZodNullable<z.ZodString>;
    viaStepId: z.ZodNullable<z.ZodString>;
    via: z.ZodEnum<{
        step: "step";
        "ownership-fallback": "ownership-fallback";
    }>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type FlowImpact = z.infer<typeof FlowImpactSchema>;
export declare const DomainImpactSchema: z.ZodObject<{
    domainId: z.ZodNullable<z.ZodString>;
    key: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type DomainImpact = z.infer<typeof DomainImpactSchema>;
export declare const OverEdgesSchema: z.ZodObject<{
    hubNodes: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        fanIn: z.ZodNumber;
    }, z.core.$strip>>;
    importOnlyCount: z.ZodNumber;
    crossCheckDiff: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        side: z.ZodEnum<{
            "ownership-only": "ownership-only";
            "reverse-only": "reverse-only";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type OverEdges = z.infer<typeof OverEdgesSchema>;
export declare const NeedsReviewItemSchema: z.ZodObject<{
    ref: z.ZodString;
    reason: z.ZodString;
}, z.core.$strip>;
export type NeedsReviewItem = z.infer<typeof NeedsReviewItemSchema>;
export declare const ImpactResultSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    depthCap: z.ZodNumber;
    edgeKinds: z.ZodArray<z.ZodEnum<{
        import: "import";
        injection: "injection";
        "field-type": "field-type";
        "ctor-param": "ctor-param";
        extends: "extends";
        implements: "implements";
        impl: "impl";
        mybatis: "mybatis";
        "mapper-xml": "mapper-xml";
    }>>;
    fanInThreshold: z.ZodNumber;
    seeds: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        origin: z.ZodEnum<{
            path: "path";
            domain: "domain";
            nl: "nl";
            route: "route";
        }>;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
    upstream: z.ZodObject<{
        files: z.ZodArray<z.ZodObject<{
            relPath: z.ZodString;
            viaKinds: z.ZodArray<z.ZodEnum<{
                import: "import";
                injection: "injection";
                "field-type": "field-type";
                "ctor-param": "ctor-param";
                extends: "extends";
                implements: "implements";
                impl: "impl";
                mybatis: "mybatis";
                "mapper-xml": "mapper-xml";
            }>>;
            minDepth: z.ZodNumber;
            citation: z.ZodNullable<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        api: z.ZodArray<z.ZodObject<{
            targetKind: z.ZodEnum<{
                batch: "batch";
                route: "route";
            }>;
            id: z.ZodString;
            filePath: z.ZodString;
            line: z.ZodNumber;
            handler: z.ZodNullable<z.ZodString>;
            via: z.ZodEnum<{
                ownership: "ownership";
                reverse: "reverse";
                both: "both";
            }>;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
        persistence: z.ZodObject<{
            mappers: z.ZodArray<z.ZodObject<{
                relPath: z.ZodString;
                namespace: z.ZodNullable<z.ZodString>;
                owners: z.ZodArray<z.ZodString>;
                citation: z.ZodNullable<z.ZodObject<{
                    filePath: z.ZodString;
                    line: z.ZodNumber;
                    snippet: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            sqlFiles: z.ZodArray<z.ZodObject<{
                relPath: z.ZodString;
                lang: z.ZodString;
            }, z.core.$strip>>;
            tableCandidateSlots: z.ZodArray<z.ZodObject<{
                mapperRelPath: z.ZodString;
                sqlSlice: z.ZodObject<{
                    filePath: z.ZodString;
                    startLine: z.ZodNumber;
                    endLine: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>>;
            kgTableCatalog: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                filePath: z.ZodString;
                startLine: z.ZodNullable<z.ZodNumber>;
                endLine: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
            jpaTables: z.ZodDefault<z.ZodArray<z.ZodObject<{
                entityClass: z.ZodString;
                relPath: z.ZodString;
                tableName: z.ZodString;
                tableExplicit: z.ZodBoolean;
                confidence: z.ZodEnum<{
                    CONFIRMED: "CONFIRMED";
                    CONFIRMED_AI: "CONFIRMED_AI";
                    INFERRED: "INFERRED";
                    UNVERIFIED: "UNVERIFIED";
                }>;
                citation: z.ZodObject<{
                    filePath: z.ZodString;
                    line: z.ZodNumber;
                    snippet: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
                columns: z.ZodArray<z.ZodObject<{
                    column: z.ZodString;
                    confidence: z.ZodEnum<{
                        CONFIRMED: "CONFIRMED";
                        CONFIRMED_AI: "CONFIRMED_AI";
                        INFERRED: "INFERRED";
                        UNVERIFIED: "UNVERIFIED";
                    }>;
                    line: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>>>;
            note: z.ZodString;
        }, z.core.$strip>;
        flows: z.ZodArray<z.ZodObject<{
            flowId: z.ZodString;
            routeId: z.ZodNullable<z.ZodString>;
            domainId: z.ZodNullable<z.ZodString>;
            domainKey: z.ZodNullable<z.ZodString>;
            domainName: z.ZodNullable<z.ZodString>;
            viaStepId: z.ZodNullable<z.ZodString>;
            via: z.ZodEnum<{
                step: "step";
                "ownership-fallback": "ownership-fallback";
            }>;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
        domains: z.ZodArray<z.ZodObject<{
            domainId: z.ZodNullable<z.ZodString>;
            key: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    downstream: z.ZodObject<{
        files: z.ZodArray<z.ZodObject<{
            relPath: z.ZodString;
            viaKinds: z.ZodArray<z.ZodEnum<{
                import: "import";
                injection: "injection";
                "field-type": "field-type";
                "ctor-param": "ctor-param";
                extends: "extends";
                implements: "implements";
                impl: "impl";
                mybatis: "mybatis";
                "mapper-xml": "mapper-xml";
            }>>;
            minDepth: z.ZodNumber;
            citation: z.ZodNullable<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    overEdges: z.ZodObject<{
        hubNodes: z.ZodArray<z.ZodObject<{
            relPath: z.ZodString;
            fanIn: z.ZodNumber;
        }, z.core.$strip>>;
        importOnlyCount: z.ZodNumber;
        crossCheckDiff: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            side: z.ZodEnum<{
                "ownership-only": "ownership-only";
                "reverse-only": "reverse-only";
            }>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    needsReview: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ImpactResult = z.infer<typeof ImpactResultSchema>;
//# sourceMappingURL=types.d.ts.map