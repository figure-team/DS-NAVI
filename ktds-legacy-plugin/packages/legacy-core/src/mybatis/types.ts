/**
 * MyBatis Mapper XML 추출 모델(Tier B) — SQL 문에서 테이블·CRUD·컬럼을 결정론으로 추출.
 *
 * 목적: 그래프에 테이블 노드가 없는 MyBatis 프로젝트에서 (a) si-테이블정의서의 테이블/컬럼,
 * (b) CRUD 매트릭스의 기능×테이블 + CRUD(메서드명 휴리스틱이 아니라 SQL 문 종류로 판정)를
 * 근거(XML file:line)와 함께 제공. 합성 금지 — 추출 불가 셀은 호출자가 [추정]/공란 처리.
 */
import { z } from 'zod'

/** SQL 문 종류 → CRUD. select=R / insert=C / update=U / delete=D. */
export const CrudSchema = z.enum(['C', 'R', 'U', 'D'])
export type Crud = z.infer<typeof CrudSchema>

/** 매퍼 한 문(statement) — id(=매퍼 인터페이스 메서드명) + CRUD + 대상 테이블/컬럼 + 위치. */
export const MyBatisStatementSchema = z.object({
  id: z.string(),
  crud: CrudSchema,
  /** 참조 테이블(대문자 보존, 정렬·유니크). */
  tables: z.array(z.string()),
  /** INSERT 컬럼리스트 / UPDATE SET 컬럼에서 추출한 컬럼명(정렬·유니크, 베스트에포트). */
  columns: z.array(z.string()),
  /** XML 내 문 시작 라인(1-기반). */
  line: z.number().int(),
})
export type MyBatisStatement = z.infer<typeof MyBatisStatementSchema>

/** 한 Mapper XML — namespace + 문 목록. */
export const MyBatisMapperSchema = z.object({
  namespace: z.string(),
  relPath: z.string(),
  statements: z.array(MyBatisStatementSchema),
})
export type MyBatisMapper = z.infer<typeof MyBatisMapperSchema>

/** mybatis-model.json — 전체 매퍼 + 테이블 인벤토리(정렬·유니크). */
export const MyBatisModelSchema = z.object({
  schemaVersion: z.literal(1),
  mappers: z.array(MyBatisMapperSchema),
  /** 전 매퍼에서 참조된 테이블(정렬·유니크). */
  tables: z.array(z.string()),
})
export type MyBatisModel = z.infer<typeof MyBatisModelSchema>
