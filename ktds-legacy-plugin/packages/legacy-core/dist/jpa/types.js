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
import { CONFIDENCE_VALUES } from '../types.js';
export const JPA_MODEL_FILENAME = 'jpa-model.json';
const ConfidenceSchema = z.enum(CONFIDENCE_VALUES);
/** 컬럼 매핑 — 명시 @Column(name=)면 CONFIRMED, 암묵 명명전략이면 INFERRED([추정]). */
export const JpaColumnSchema = z.object({
    fieldName: z.string(),
    columnName: z.string(),
    /** @Column(name=) 명시 여부. false면 암묵 명명전략 추론(camelCase→snake_case). */
    explicit: z.boolean(),
    line: z.number().int().positive(),
    confidence: ConfidenceSchema, // CONFIRMED(명시) | INFERRED(암묵)
});
/** 관계 → FK 엣지(Tier B [추정]). */
export const JpaRelationSchema = z.object({
    fieldName: z.string(),
    kind: z.enum(['OneToMany', 'ManyToOne', 'OneToOne', 'ManyToMany']),
    /** 대상 엔티티 타입(제네릭이면 원소 타입). */
    targetType: z.string().nullable(),
    /** @JoinColumn(name=) 명시 FK 컬럼명(없으면 null). */
    joinColumn: z.string().nullable(),
    line: z.number().int().positive(),
    confidence: ConfidenceSchema, // INFERRED(Tier B)
});
/** @Entity → 테이블 매핑. */
export const JpaEntitySchema = z.object({
    className: z.string(),
    relPath: z.string(),
    line: z.number().int().positive(),
    tableName: z.string(),
    /** @Table(name=) 명시 여부. false면 암묵 명명전략(snake_case(className)). */
    tableExplicit: z.boolean(),
    tableConfidence: ConfidenceSchema, // CONFIRMED(명시) | INFERRED(암묵)
    /** @Id 필드명(없으면 null). */
    idField: z.string().nullable(),
    columns: z.array(JpaColumnSchema),
    relations: z.array(JpaRelationSchema),
});
/** 파생 쿼리(findByX) → 컬럼 추론(Tier B [추정]). */
export const JpaDerivedQuerySchema = z.object({
    method: z.string(),
    /** 추론된 컬럼명(snake_case), 정렬. */
    columns: z.array(z.string()),
    line: z.number().int().positive(),
    confidence: ConfidenceSchema, // INFERRED
});
/** @Query 명시 쿼리 — JPQL(Tier A CONFIRMED) / nativeQuery(Tier C UNVERIFIED). */
export const JpaQuerySchema = z.object({
    method: z.string(),
    native: z.boolean(),
    /** 쿼리 본문(있으면). */
    query: z.string().nullable(),
    line: z.number().int().positive(),
    confidence: ConfidenceSchema, // CONFIRMED(JPQL) | UNVERIFIED(native)
});
/** Spring Data 리포지토리. */
export const JpaRepositorySchema = z.object({
    className: z.string(),
    relPath: z.string(),
    line: z.number().int().positive(),
    /** JpaRepository<T,ID> 의 T(entity). 해소 가능하면 Tier A CONFIRMED. */
    entityType: z.string().nullable(),
    idType: z.string().nullable(),
    /** Spring Data 베이스 인터페이스명(JpaRepository/CrudRepository 등). */
    baseInterface: z.string().nullable(),
    derivedQueries: z.array(JpaDerivedQuerySchema),
    queries: z.array(JpaQuerySchema),
});
/**
 * jpa-model.json — JPA/Spring Data 추출 산출물.
 * MyBatis 와 공존(AC-16b): 이 모델은 JPA 신호만 담고, MyBatis 는 기존 edges/step-layer 가 담당.
 */
export const JpaModelSchema = z.object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().nullable(),
    entities: z.array(JpaEntitySchema),
    repositories: z.array(JpaRepositorySchema),
    /** 해소 못한 신호(보고, 누락 금지) — 예: entity 타입 미해소 repository. */
    unresolved: z.array(z.object({ ref: z.string(), reason: z.string() })),
});
//# sourceMappingURL=types.js.map