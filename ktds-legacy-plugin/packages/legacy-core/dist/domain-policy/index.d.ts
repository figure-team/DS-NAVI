import type { BranchSignalSet } from './types.js';
export { BRANCH_SIGNALS_FILENAME, BranchKindSchema, BranchSignalSchema, BranchSignalSetSchema, } from './types.js';
export type { BranchKind, BranchSignal, BranchSignalSet, DomainPolicyInput } from './types.js';
export { extractBranches, scanBranches, extractEnums } from './branch-scanner.js';
export type { EnumFact } from './branch-scanner.js';
export { buildDomainPolicyInputs, assembleDomainPolicies } from './assemble.js';
export type { DomainGraphLite } from './assemble.js';
/** branch-signals.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writeBranchSignals(projectRoot: string, model: BranchSignalSet): void;
//# sourceMappingURL=index.d.ts.map