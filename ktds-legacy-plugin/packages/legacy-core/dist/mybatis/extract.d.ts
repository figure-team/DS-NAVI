import type { MyBatisMapper, MyBatisModel } from './types.js';
export declare function isMapperXmlDocument(content: string): boolean;
/** 한 Mapper XML 내용 → MyBatisMapper. 루트가 `<mapper namespace>` 가 아니면 null. */
export declare function parseMapperXml(content: string, relPath: string): MyBatisMapper | null;
/** 매퍼 XML 파일들 → MyBatisModel(결정론: namespace/문/테이블 정렬). */
export declare function buildMyBatisModel(files: Array<{
    relPath: string;
    content: string;
}>): MyBatisModel;
/** namespace basename(마지막 '.' 뒤) — 매퍼 인터페이스 클래스명과 매칭용. */
export declare function namespaceBaseName(namespace: string): string;
//# sourceMappingURL=extract.d.ts.map