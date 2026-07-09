import type { DocInput } from '../doc-generator/builders/shared.js';
import type { RtmModel } from './types.js';
/**
 * AS-IS RTM 모델 빌더. flow 노드를 도메인별로 묶어 기능 행을 만들고 4축을 근거로 채운다.
 * gitCommit 은 호출자가 주입(결정론). requirements=[] (R1).
 */
export declare function buildRtm(input: DocInput, gitCommit?: string | null): RtmModel;
//# sourceMappingURL=build-rtm.d.ts.map