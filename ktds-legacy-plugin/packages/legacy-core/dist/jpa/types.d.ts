/**
 * JPA / Spring Data 추출 데이터 계약(보완 B) — zod 스키마 + z.infer 타입.
 *
 * 3-Tier 신뢰 사다리(스펙 T3/BF1):
 *  - Tier A(CONFIRMED 가능): `@Entity`→`@Table(name=)/@Column(name=)` 명시, `JpaRepository<T,ID>`
 *    →entity T→dao, `@Query(JPQL)` 명시. 애너테이션 file:line 앵커.
 *  - Tier B([추정]/INFERRED): 암묵 명명전략(camelCase→snake_case), 파생쿼리 메서드명→컬럼,
 *    `@OneToMany/@ManyToOne/@JoinColumn`→FK.
 *  - Tier C([확인 필요]/UNVERIFIED): `nativeQuery=true`·QueryDSL/Criteria·동적.
 *
 * 결정론: 모든 배열은 생산자에서 명시 키로 정렬. 신뢰도는 `../types.js` CONFIDENCE_VALUES 단일 소스.
 */
import { z } from 'zod';
export declare const JPA_MODEL_FILENAME = "jpa-model.json";
/** 컬럼 매핑 — 명시 @Column(name=)면 CONFIRMED, 암묵 명명전략이면 INFERRED([추정]). */
export declare const JpaColumnSchema: z.ZodObject<{
    fieldName: z.ZodString;
    columnName: z.ZodString;
    explicit: z.ZodBoolean;
    line: z.ZodNumber;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type JpaColumn = z.infer<typeof JpaColumnSchema>;
/** 관계 → FK 엣지(Tier B [추정]). */
export declare const JpaRelationSchema: z.ZodObject<{
    fieldName: z.ZodString;
    kind: z.ZodEnum<{
        OneToMany: "OneToMany";
        ManyToOne: "ManyToOne";
        OneToOne: "OneToOne";
        ManyToMany: "ManyToMany";
    }>;
    targetType: z.ZodNullable<z.ZodString>;
    joinColumn: z.ZodNullable<z.ZodString>;
    line: z.ZodNumber;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type JpaRelation = z.infer<typeof JpaRelationSchema>;
/** @Entity → 테이블 매핑. */
export declare const JpaEntitySchema: z.ZodObject<{
    className: z.ZodString;
    relPath: z.ZodString;
    line: z.ZodNumber;
    tableName: z.ZodString;
    tableExplicit: z.ZodBoolean;
    tableConfidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
    idField: z.ZodNullable<z.ZodString>;
    columns: z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        columnName: z.ZodString;
        explicit: z.ZodBoolean;
        line: z.ZodNumber;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
    relations: z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        kind: z.ZodEnum<{
            OneToMany: "OneToMany";
            ManyToOne: "ManyToOne";
            OneToOne: "OneToOne";
            ManyToMany: "ManyToMany";
        }>;
        targetType: z.ZodNullable<z.ZodString>;
        joinColumn: z.ZodNullable<z.ZodString>;
        line: z.ZodNumber;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JpaEntity = z.infer<typeof JpaEntitySchema>;
/** 파생 쿼리(findByX) → 컬럼 추론(Tier B [추정]). */
export declare const JpaDerivedQuerySchema: z.ZodObject<{
    method: z.ZodString;
    columns: z.ZodArray<z.ZodString>;
    line: z.ZodNumber;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type JpaDerivedQuery = z.infer<typeof JpaDerivedQuerySchema>;
/** @Query 명시 쿼리 — JPQL(Tier A CONFIRMED) / nativeQuery(Tier C UNVERIFIED). */
export declare const JpaQuerySchema: z.ZodObject<{
    method: z.ZodString;
    native: z.ZodBoolean;
    query: z.ZodNullable<z.ZodString>;
    line: z.ZodNumber;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type JpaQuery = z.infer<typeof JpaQuerySchema>;
/** Spring Data 리포지토리. */
export declare const JpaRepositorySchema: z.ZodObject<{
    className: z.ZodString;
    relPath: z.ZodString;
    line: z.ZodNumber;
    entityType: z.ZodNullable<z.ZodString>;
    idType: z.ZodNullable<z.ZodString>;
    baseInterface: z.ZodNullable<z.ZodString>;
    derivedQueries: z.ZodArray<z.ZodObject<{
        method: z.ZodString;
        columns: z.ZodArray<z.ZodString>;
        line: z.ZodNumber;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
    queries: z.ZodArray<z.ZodObject<{
        method: z.ZodString;
        native: z.ZodBoolean;
        query: z.ZodNullable<z.ZodString>;
        line: z.ZodNumber;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JpaRepository = z.infer<typeof JpaRepositorySchema>;
/**
 * jpa-model.json — JPA/Spring Data 추출 산출물.
 * MyBatis 와 공존(AC-16b): 이 모델은 JPA 신호만 담고, MyBatis 는 기존 edges/step-layer 가 담당.
 */
export declare const JpaModelSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    entities: z.ZodArray<z.ZodObject<{
        className: z.ZodString;
        relPath: z.ZodString;
        line: z.ZodNumber;
        tableName: z.ZodString;
        tableExplicit: z.ZodBoolean;
        tableConfidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
        idField: z.ZodNullable<z.ZodString>;
        columns: z.ZodArray<z.ZodObject<{
            fieldName: z.ZodString;
            columnName: z.ZodString;
            explicit: z.ZodBoolean;
            line: z.ZodNumber;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
        relations: z.ZodArray<z.ZodObject<{
            fieldName: z.ZodString;
            kind: z.ZodEnum<{
                OneToMany: "OneToMany";
                ManyToOne: "ManyToOne";
                OneToOne: "OneToOne";
                ManyToMany: "ManyToMany";
            }>;
            targetType: z.ZodNullable<z.ZodString>;
            joinColumn: z.ZodNullable<z.ZodString>;
            line: z.ZodNumber;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    repositories: z.ZodArray<z.ZodObject<{
        className: z.ZodString;
        relPath: z.ZodString;
        line: z.ZodNumber;
        entityType: z.ZodNullable<z.ZodString>;
        idType: z.ZodNullable<z.ZodString>;
        baseInterface: z.ZodNullable<z.ZodString>;
        derivedQueries: z.ZodArray<z.ZodObject<{
            method: z.ZodString;
            columns: z.ZodArray<z.ZodString>;
            line: z.ZodNumber;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
        queries: z.ZodArray<z.ZodObject<{
            method: z.ZodString;
            native: z.ZodBoolean;
            query: z.ZodNullable<z.ZodString>;
            line: z.ZodNumber;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    unresolved: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JpaModel = z.infer<typeof JpaModelSchema>;
//# sourceMappingURL=types.d.ts.map