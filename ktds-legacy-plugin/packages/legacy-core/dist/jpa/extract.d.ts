import type { ScanCacheSession } from '../scan-cache/index.js';
import type { CensusReport } from '../domain-map/types.js';
import { type JpaEntity, type JpaModel, type JpaRepository } from './types.js';
/** camelCase/PascalCase → snake_case(Hibernate 암묵 명명전략 기본, BF1). */
export declare function snakeCase(name: string): string;
/** findByFirstNameAndLastName → [first_name, last_name](정렬). 미매치 → []. */
export declare function parseDerivedQuery(method: string): string[];
/** 단일 Java 소스에서 JPA 엔티티/리포지토리 추출(순수, 파싱만). */
export declare function extractJpaFromSource(source: string, relPath: string): Promise<{
    entities: JpaEntity[];
    repositories: JpaRepository[];
    unresolved: Array<{
        ref: string;
        reason: string;
    }>;
}>;
/** 프로젝트 전체 census 의 Java 파일을 스캔해 jpa-model.json 모델을 만든다(결정론). */
export declare function extractJpaModel(projectRoot: string, census: CensusReport, cache?: ScanCacheSession): Promise<JpaModel>;
//# sourceMappingURL=extract.d.ts.map