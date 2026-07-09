/**
 * MyBatis Mapper XML 추출 모델(Tier B) — SQL 문에서 테이블·CRUD·컬럼을 결정론으로 추출.
 *
 * 목적: 그래프에 테이블 노드가 없는 MyBatis 프로젝트에서 (a) si-테이블정의서의 테이블/컬럼,
 * (b) CRUD 매트릭스의 기능×테이블 + CRUD(메서드명 휴리스틱이 아니라 SQL 문 종류로 판정)를
 * 근거(XML file:line)와 함께 제공. 합성 금지 — 추출 불가 셀은 호출자가 [추정]/공란 처리.
 */
import { z } from 'zod';
/** SQL 문 종류 → CRUD. select=R / insert=C / update=U / delete=D. */
export declare const CrudSchema: z.ZodEnum<{
    C: "C";
    R: "R";
    U: "U";
    D: "D";
}>;
export type Crud = z.infer<typeof CrudSchema>;
/** 매퍼 한 문(statement) — id(=매퍼 인터페이스 메서드명) + CRUD + 대상 테이블/컬럼 + 위치. */
export declare const MyBatisStatementSchema: z.ZodObject<{
    id: z.ZodString;
    crud: z.ZodEnum<{
        C: "C";
        R: "R";
        U: "U";
        D: "D";
    }>;
    tables: z.ZodArray<z.ZodString>;
    columns: z.ZodArray<z.ZodString>;
    line: z.ZodNumber;
}, z.core.$strip>;
export type MyBatisStatement = z.infer<typeof MyBatisStatementSchema>;
/** 한 Mapper XML — namespace + 문 목록. */
export declare const MyBatisMapperSchema: z.ZodObject<{
    namespace: z.ZodString;
    relPath: z.ZodString;
    statements: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        crud: z.ZodEnum<{
            C: "C";
            R: "R";
            U: "U";
            D: "D";
        }>;
        tables: z.ZodArray<z.ZodString>;
        columns: z.ZodArray<z.ZodString>;
        line: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type MyBatisMapper = z.infer<typeof MyBatisMapperSchema>;
/** mybatis-model.json — 전체 매퍼 + 테이블 인벤토리(정렬·유니크). */
export declare const MyBatisModelSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    mappers: z.ZodArray<z.ZodObject<{
        namespace: z.ZodString;
        relPath: z.ZodString;
        statements: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            crud: z.ZodEnum<{
                C: "C";
                R: "R";
                U: "U";
                D: "D";
            }>;
            tables: z.ZodArray<z.ZodString>;
            columns: z.ZodArray<z.ZodString>;
            line: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    tables: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type MyBatisModel = z.infer<typeof MyBatisModelSchema>;
//# sourceMappingURL=types.d.ts.map