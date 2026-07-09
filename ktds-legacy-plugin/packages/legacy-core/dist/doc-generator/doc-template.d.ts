/**
 * 문서 템플릿(doc-template) — 산출물 문서의 **런타임 로드 템플릿** 파서/적용기(D2).
 *
 * node-template.ts(node-detail) 와 동형 철학: 플러그인 동봉 .md(`templates/doc/*.md`)를
 * 사람이 편집하면 재빌드 없이 반영. 단 doc-generator 는 claim **생성이 코드 로직**(그래프
 * 질의)이므로 템플릿은 **표시 구조만**(문서 제목·섹션 헤딩·표 컬럼명·섹션 순서) 외부화한다.
 * 각 섹션은 `{#바인딩키}`로 빌더가 채울 데이터를 가리킨다(고정 어휘).
 *
 * - parseDocTemplate: 한 템플릿 .md → DocTemplate(순수, IO 는 호출자/.mjs).
 * - applyDocTemplate: 빌더 산출 GeneratedDoc 에 템플릿의 헤딩/컬럼/순서를 입힌다.
 *   템플릿 미적용 시 빌더 기본 구조 그대로(골든 스냅샷 보존).
 */
import { z } from 'zod';
import type { GeneratedDoc } from './types.js';
export declare const DocTemplateSectionSchema: z.ZodObject<{
    key: z.ZodString;
    heading: z.ZodString;
    columns: z.ZodOptional<z.ZodArray<z.ZodString>>;
    prose: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DocTemplateSection = z.infer<typeof DocTemplateSectionSchema>;
export declare const DocTemplateSchema: z.ZodObject<{
    docId: z.ZodString;
    title: z.ZodString;
    methodology: z.ZodEnum<{
        "as-built": "as-built";
        "si-standard": "si-standard";
        policy: "policy";
        "domain-policy": "domain-policy";
    }>;
    sections: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        heading: z.ZodString;
        columns: z.ZodOptional<z.ZodArray<z.ZodString>>;
        prose: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DocTemplate = z.infer<typeof DocTemplateSchema>;
/**
 * 한 문서 템플릿(.md) → DocTemplate. frontmatter(docId/title/methodology) +
 * `## 라벨 {#키}` 섹션들. 섹션 헤딩 아래 첫 표 헤더 줄(`| ... |`)이 있으면 columns(표 섹션),
 * 없으면 목록 섹션. 헤딩 앞 제목(`#`)/주석(`<!-- -->`)/프로즈는 무시.
 * 결정론: 파일 순서 보존. 형식 오류는 명확히 throw(조용한 폴백 금지).
 */
export declare function parseDocTemplate(md: string): DocTemplate;
/**
 * 빌더 산출 GeneratedDoc 에 템플릿(제목·섹션 헤딩·컬럼·순서)을 입힌다.
 * - 출력 섹션 = **템플릿 섹션 순서**. 각 섹션은 빌더가 같은 key 로 만든 데이터(claims/table)를
 *   채우고, 없으면 빈 섹션.
 * - 표 컬럼: 템플릿 컬럼 수가 빌더 표 컬럼 수와 **같으면** 템플릿 라벨로 rename(편집 반영).
 *   다르면(매트릭스 등 동적 컬럼) 빌더 컬럼 유지(안전).
 * 템플릿 미적용 경로는 호출자가 빌더 산출을 그대로 쓰면 된다(이 함수 미호출 = 기존 동작).
 */
export declare function applyDocTemplate(doc: GeneratedDoc, tpl: DocTemplate): GeneratedDoc;
//# sourceMappingURL=doc-template.d.ts.map