import type { RawInterfaceSignal } from './java-scan.js';
/**
 * 단일 텍스트 파일(mapper XML / .sql)에서 DB link 신호를 추출한다.
 * @param lang census lang ('xml' | 'sql')
 */
export declare function scanDbLinks(rawText: string, filePath: string, lang: string): RawInterfaceSignal[];
//# sourceMappingURL=text-scan.d.ts.map