import type { RtmFunctionRow, RtmModel, RtmRequirement } from './types.js';
/**
 * 요구사항을 모델에 적용. newFunctions(신규 TO-BE 행)는 기존 기능과 합쳐 동일 규칙으로 재계산.
 * 반환: functions(상태·이력·규칙·NFR 재계산) + requirements(정규화·정렬) + coverage.
 */
export declare function applyRequirements(model: RtmModel, requirements: RtmRequirement[], newFunctions?: RtmFunctionRow[]): RtmModel;
//# sourceMappingURL=apply-requirements.d.ts.map