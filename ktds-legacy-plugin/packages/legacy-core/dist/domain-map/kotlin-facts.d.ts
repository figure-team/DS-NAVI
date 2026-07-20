import type { JavaFileFacts } from './java-facts.js';
/** 한 Kotlin 파일에서 JavaFileFacts 동형 팩트를 추출한다(파일당 1회 파싱). */
export declare function extractKotlinFacts(relPath: string, src: string): Promise<JavaFileFacts>;
//# sourceMappingURL=kotlin-facts.d.ts.map