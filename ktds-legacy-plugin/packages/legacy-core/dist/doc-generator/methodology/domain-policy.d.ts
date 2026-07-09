import type { GeneratedDoc } from '../types.js';
import type { MethodologyModule } from './types.js';
import type { DomainPolicyInput } from '../../domain-policy/types.js';
/** 한 도메인(정책 토픽)의 정책 정의서를 §0~§8 양식으로 조립한다. */
export declare function buildDomainPolicyDoc(d: DomainPolicyInput): GeneratedDoc;
/** domain-policy 모듈 — 도메인(토픽)당 1문서를 동적 산출. */
export declare const domainPolicyMethodology: MethodologyModule;
//# sourceMappingURL=domain-policy.d.ts.map