import type { Node } from 'web-tree-sitter';
import type { CensusReport, EdgeRecord } from './types.js';
/** 원본 상대경로 스펙 1건 — 비상대(패키지) 임포트는 이미 걸러진 상태. */
export interface RawImportRef {
    /** `./x`·`../x` 형태의 원본 스펙. */
    spec: string;
    /** 1-based 시작 줄. */
    line: number;
}
/**
 * 파싱된 루트에서 상대경로 import/export-from/동적 import() 스펙을 모은다.
 * 비상대(패키지) 임포트, 보간 포함 템플릿은 조용히 제외한다. 정렬: (line, spec).
 */
export declare function collectRelativeImportSpecs(root: Node): RawImportRef[];
/**
 * 상대경로 스펙을 census 파일 집합에 대해 고정 우선순위로 해소한다.
 * 스펙에 이미 확장자가 있으면(예: `./data.json`) 그 경로만 그대로 확인한다.
 * 해소 실패(후보 없음) -> null(누락 없이 조용히 제외 — 호출자가 필요시 unresolved 로 승격).
 */
export declare function resolveRelativeSpec(fromRelPath: string, spec: string, fileSet: ReadonlySet<string>): string | null;
/**
 * census 의 ts/tsx/javascript 파일 전체에서 import 엣지를 추출한다(파일 기록 없음).
 * 파일별 읽기/파싱 실패는 그 파일만 조용히 제외한다(다른 스캐너와 동일 격리 관례).
 */
export declare function extractTsImportEdges(projectRoot: string, census: CensusReport): Promise<EdgeRecord[]>;
//# sourceMappingURL=ts-imports.d.ts.map