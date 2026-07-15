/** 도메인별 대표 파일 표본 상한 — `group-input`(understand-map.mjs:277) 과 동일 값·동일 의미. */
export declare const SAMPLE_FILES_MAX = 8;
/** 번들 전체 문자 예산. `domain-map/fill-fanout.ts:56` `DEFAULT_CHUNK_CHAR_CAP` 과 동일 값. */
export declare const DEFAULT_BUNDLE_CHAR_CAP = 60000;
/** 축별 항목 상한(사전 캡). charCap 은 그 뒤에 걸리는 2차 방어선이다. */
export declare const AXIS_CAPS: {
    readonly entities: 20;
    readonly businessRules: 20;
    readonly businessFlows: 5;
    readonly claims: 40;
    readonly tables: 15;
    readonly crudRows: 20;
    readonly functions: 25;
    /** P4: 화면 축. 실측 — 관련 화면 4장 전량이면 106,556자라 예산을 통째로 먹는다. */
    readonly screens: 4;
    /** P4: 화면당 annotation. 실측 signonForm 16건이라 전량이 들어온다. */
    readonly annotationsPerScreen: 40;
    /**
     * P4: 정책서 수. 도메인 정책서 + **전역 정책서 전량**을 담을 만큼 넉넉해야 한다 —
     * 행 0건 전역 정책서는 §4.1 오독 차단의 핵심 신호인데 캡에 밀려 빠지면 그 장치가 죽는다
     * (실측 jpetstore: 정책서 10종 중 도메인 6 + 전역 4).
     */
    readonly policyDocs: 10;
    /** P4: 정책서당 절. 실측 구조가 §0~§8 로 9개다. */
    readonly policySections: 9;
    /** P4: 절당 표 행. */
    readonly policyRowsPerSection: 12;
};
/**
 * P4 **축별 예산 배분** — `floor`(최소 보장) + `weight`(잔여 비례 배분 가중치).
 *
 * ★ 왜 필요한가: 전역 캡 하나 + 단일 우선순위 트리머면 **트리머 순서가 생존을 결정**한다
 *   (어느 축이 완전히 고갈된 뒤에야 다음 축이 양보). floor 는 **"모든 축이 자기 pre-cite 코어를
 *   지킨다"를 구조로 보장**한다 — 이게 v2 의 핵심 안전장치다.
 *
 * ★ floor 값의 근거(전부 jpetstore 실측):
 *  - `screens` 11,000 — signonForm 1장(ann 16건)이 투영 후 ~11K. **1장은 통째로 지킨다**:
 *    "카카오로 로그인" 버튼을 어디에 넣을지가 `selector`·`bbox` 에 있고(§4) 잘린 ann 은
 *    그 자리를 못 가리킨다.
 *  - `domain` 12,000 — account claims 상위 ~15건(pre-cite 페이로드의 본체).
 *  - `policy` 8,000 — 이 축은 **두 가지**를 동시에 실어야 한다: ① policy-domain-account 의
 *    §8 미결 + §4 정책규칙 ≈ 4.8K(카카오 설계의 핵심 쟁점) ② 전역 정책서 **스텁 6건 ≈ 1.5K**
 *    (§4.1 오독 차단 — 행 0건인 policy-authz·policy-validation 의 존재를 알리는 값싼 신호).
 *    처음엔 5,000 으로 뒀다가 **실측에서 ①이 통째로 밀려나** 교정했다(스텁만 남고 미결이 사라짐).
 *    floor 는 축의 **목적**을 감당해야 의미가 있다.
 *  - `rtm` 6,000 — account 기능행(entryPoint/implementation 근거 = 시드 도출의 입력, §6.3).
 *  - `schema` 4,500 / `crud` 1,500 — SIGNON·ACCOUNT·PROFILE + "로그인 처리" 행.
 *
 * ★ weight: pre-cite 밀도가 높고 요청 특정성이 큰 축(domain·screens)에 잔여를 더 준다.
 * ★ 합 = 40,000 < 60,000 — 나머지는 **수요 기반 비례 배분**이라 축이 없으면(축소 모드) 그 몫이
 *   풀로 환원된다(= v1 과 같은 배분으로 자연 수렴).
 */
export declare const AXIS_BUDGET: {
    readonly domain: {
        readonly floor: 12000;
        readonly weight: 3;
    };
    readonly schema: {
        readonly floor: 4500;
        readonly weight: 1;
    };
    readonly crud: {
        readonly floor: 1500;
        readonly weight: 1;
    };
    readonly rtm: {
        readonly floor: 6000;
        readonly weight: 2;
    };
    readonly screens: {
        readonly floor: 11000;
        readonly weight: 3;
    };
    readonly policy: {
        readonly floor: 8000;
        readonly weight: 2;
    };
};
export type AxisBudgetKey = keyof typeof AXIS_BUDGET;
/** 필터가 아무것도 못 고를 때의 폴백 상한(§7 C7 — "상위 N + 정직한 생략 보고"). */
export declare const FALLBACK_TOP_N: {
    readonly domains: 5;
    readonly tables: 10;
    readonly crudRows: 10;
    readonly functions: 10;
    /** P4: 화면은 폴백해도 비싸다(1장 ~11K) — 상위 1장만. */
    readonly screens: 1;
    readonly policyDocs: 1;
};
/**
 * 정책서 **절 우선순위 — 토큰 매치가 아니라 "절의 종류"로 정한다.**
 *
 * ★ 이 결정의 근거는 실측이다: 카카오 설계의 **핵심 쟁점**인 policy-domain-account §8 미결
 *   *"SIGNON.PASSWORD 는 varchar(25) 평문 컬럼이며 … 해시/솔트 처리 로직은 발견되지 않음"* 은
 *   요청 토큰(`로그인`·`카카오`)을 **하나도 포함하지 않는다**(실측 확인). 토큰으로 절을 고르면
 *   **바로 그 미결이 탈락한다** — 설계서 §1.2 가 "(누락) password 처리 미설계"로 지적한 그 실패의
 *   재발이다. 그래서 종류 우선순위가 1차 기준이고 토큰은 동순위 안에서만 가산점으로 쓴다.
 *
 * ★ 순위의 논리: 요구사항 설계에 직접 쓰이는 절이 위다. **미결이 최상위**인 이유 — 미결은
 *   "이미 아는 모르는 것"이라 신규 설계가 **반드시 건드리는** 지점이다(평문 password 를 모른 채
 *   OAuth 자동가입을 설계하면 틀린다). 반대로 §0 문서정보·개정이력은 `《 》` 자리표시자
 *   투성이 보일러플레이트라 최하위.
 */
export declare const POLICY_SECTION_PRIORITY: {
    rank: number;
    pattern: RegExp;
}[];
/** `domain-graph.json` 노드 — 실측 키(`nodes[].{id,name,type,tags,filePath,summary,domainMeta}`). */
export interface DomainGraphNode {
    id?: unknown;
    name?: unknown;
    type?: unknown;
    tags?: unknown;
    filePath?: unknown;
    summary?: unknown;
    domainMeta?: {
        entities?: unknown;
        businessRules?: unknown;
        businessFlows?: unknown;
        ktdsClaims?: unknown;
        groundedCount?: unknown;
        groundedPct?: unknown;
        reviewCount?: unknown;
    };
}
/**
 * 정책서 원문 1건 — 마크다운은 **파싱 전 원문 그대로** 넘긴다(파싱은 순수 함수라 여기 산다).
 * IO 경계(`scripts/rtm-intake.mjs`)는 읽어서 넘기기만 한다.
 */
export interface IntakePolicyDoc {
    /** 프로젝트 상대 경로 — 예: `.understand-anything/doc-output/policy-domain-account.md`. */
    relPath: string;
    markdown: string;
}
export interface IntakeBundleSources {
    /** `.understand-anything/domain-graph.json` */
    domainGraph: unknown | null;
    /** `.spec/map/db-schema.json` */
    dbSchema: unknown | null;
    /** `.spec/map/crud-matrix.json` — 데이터 축의 **하위 소스**(부재는 축 부재가 아니다). */
    crudMatrix: unknown | null;
    /** `.understand-anything/rtm.json` */
    rtm: unknown | null;
    /**
     * P4 `.understand-anything/screens.json` — **축소 모드**(§10-1): 없어도 exit 2 가 아니다.
     * optional 인 이유: v1 호출자(P3)를 그대로 통과시킨다(하위호환).
     */
    screens?: unknown | null;
    /** P4 `.understand-anything/doc-output/policy-*.md` — 축소 모드(§10-1). */
    policyDocs?: IntakePolicyDoc[] | null;
}
export interface BuildIntakeInputOptions {
    /** 요청 원문(사전 필터의 입력). */
    request: string;
    /** 번들 문자 예산(기본 `DEFAULT_BUNDLE_CHAR_CAP`). */
    charCap?: number;
}
/** 근거율 — 분자·분모를 **함께** 싣는다. 비율만 주면 "0/0"과 "0/100"을 구분할 수 없다(§4.1). */
export interface EvidenceStat {
    /** 근거가 붙은 항목 수. */
    cited: number;
    /** 전체 항목 수. 0이면 rate 는 null(무한대·0 오독 방지). */
    total: number;
    /** cited/total. total=0 이면 **null** — "근거율 0" 과 "잴 것이 없음" 은 다르다. */
    rate: number | null;
}
/**
 * **pre-cite 인용**(§6.2) — LLM 이 **verbatim 복사만** 하도록 실제 스니펫을 동봉한다.
 * 이게 없으면 LLM 이 인용을 지어낸다(설계서 §1.2 `evidence: 0` 의 재발).
 */
export interface IntakePreCite {
    file: string;
    line: number | null;
    /** 실파일에서 결정론 추출된 원문. **null 이면 정직하게 null**(지어내지 말라는 신호). */
    snippet: string | null;
}
/**
 * 도메인 claim **투영** — v1 은 원시 `unknown` 을 실어 `citations[].status:"ok"` 같은 잡음까지
 * 예산을 먹었다. ①식별이 실제로 쓰는 것만 남긴다(pre-cite 손실 0).
 * `verdict` 는 남긴다 — 근거↔신뢰도 불변식의 신호라 떼면 안 된다.
 */
export interface IntakeBundleClaim {
    kind: string | null;
    ref: string | null;
    text: string;
    verdict: string | null;
    citations: IntakePreCite[];
    /** 관련도 랭킹에 쓰인 매치 토큰(감사용 — 왜 이 claim 이 살아남았나). */
    matchedTokens: string[];
}
export interface IntakeBundleDomain {
    id: string;
    name: string;
    summary: string | null;
    /** 이 도메인에 속한 flow/step 노드 수(전량 대신 카운트 — group-input 패턴). */
    fileCount: number;
    /** 대표 파일 `slice(0, SAMPLE_FILES_MAX)`, 결정론 정렬(group-input 패턴). */
    sampleFiles: string[];
    counts: {
        flows: number;
        steps: number;
        entities: number;
        businessRules: number;
        businessFlows: number;
        claims: number;
    };
    groundedPct: number | null;
    entities: string[];
    businessRules: string[];
    businessFlows: unknown[];
    /** 관련도 **내림차순** — 트림은 꼬리(=덜 관련된 claim)부터 턴다. */
    claims: IntakeBundleClaim[];
    /** 이 도메인이 뽑힌 이유 — 매치된 요청 토큰(폴백이면 빈 배열). */
    matchedTokens: string[];
}
export interface IntakeBundleTable {
    name: string;
    relPath: string | null;
    line: number | null;
    primaryKey: string[];
    columns: {
        name: string;
        type: string | null;
        nullable: boolean | null;
        primaryKey: boolean;
        line: number | null;
    }[];
    foreignKeys: unknown[];
    /** 시드 데이터 행은 **싣지 않는다**(스키마가 아니다). 개수만 보고. */
    rowCount: number;
    /** 이 테이블이 뽑힌 이유. */
    selectedBy: ('token' | 'crud')[];
}
export interface IntakeBundleCrudRow {
    feature: string;
    /** 비어있지 않은 셀만 — `{ table, ops }`. 13열 전량 대신 실제 접근만 싣는다. */
    cells: {
        table: string;
        ops: string;
    }[];
    confidence: string;
    evidence: {
        file: string;
        line: number | null;
    }[];
    matchedTokens: string[];
}
export interface IntakeBundleFunction {
    id: string;
    name: string;
    domainId: string | null;
    domainName: string | null;
    entryPoint: {
        value: string;
        confidence: string;
        evidence: {
            file: string;
            line: number | null;
        }[];
    };
    implementation: {
        value: string;
        confidence: string;
        evidence: {
            file: string;
            line: number | null;
        }[];
    };
    origin: string | null;
    state: string | null;
    /** `token`=요청 원문 매치, `domain`=선정된 도메인 소속으로 딸려온 것. 감사 가능하게 남긴다. */
    selectedBy: 'token' | 'domain';
}
/**
 * 화면 annotation — **DOM 삽입 지점**이 여기 있다. `selector`·`bbox` 가 "카카오로 로그인 버튼을
 * 어디에 넣나"를 확정한다(§4: "최상. SignonForm.jsp 의 DOM·selector·bbox → 버튼 삽입 지점 확정").
 */
export interface IntakeBundleAnnotation {
    no: number | null;
    label: string | null;
    eventType: string | null;
    /** DOM 선택자 — 예: `#MenuContent > a:nth-of-type(1)`(실측). */
    selector: string | null;
    /** 화면상 좌표·크기(캡처 기준). 버튼 삽입 위치 판단용이라 **떼지 않는다**. */
    bbox: {
        x: number | null;
        y: number | null;
        width: number | null;
        height: number | null;
    } | null;
    description: string | null;
    /** `mechanical` 중 **값이 있는 것만**(원본은 null 필드 8개라 그대로 실으면 예산 낭비). */
    mechanical: Record<string, string | boolean | number> | null;
    /** 핸들러 — `evidence` 가 곧 **pre-cite**(실측상 snippet 이 이미 들어있다). */
    handler: {
        target: string | null;
        confidence: string | null;
        evidence: IntakePreCite[];
    } | null;
}
export interface IntakeBundleScreen {
    id: string;
    jspFile: string | null;
    title: string | null;
    domain: string | null;
    url: string | null;
    summary: {
        text: string | null;
        confidence: string | null;
    } | null;
    /** 전체 annotation 수(트림 전) — 실린 수(`annotations.length`)와 다를 수 있다(§4.1 정직 보고). */
    annotationCount: number;
    annotations: IntakeBundleAnnotation[];
    /** `token`=요청 원문 매치, `domain`=선정 도메인 소속으로 딸려온 것. */
    selectedBy: ('token' | 'domain')[];
    matchedTokens: string[];
}
/** 정책서 표의 한 행 — `근거` 열이 pre-cite 다(`file:line` 문자열이라 파싱해 싣는다). */
export interface IntakeBundlePolicyRow {
    /** 표의 셀 전량(헤더는 절에 있다). */
    cells: string[];
    /** `신뢰도` 열 — `[확정]`·`[추정]`·`[확인 필요]`. */
    confidence: string | null;
    /** `근거` 열에서 뽑은 인용. */
    evidence: IntakePreCite[];
}
export interface IntakeBundlePolicySection {
    heading: string;
    /** `POLICY_SECTION_PRIORITY` 순위 — **왜 이 절이 살아남았나**의 감사 근거. */
    rank: number;
    /** 표 헤더 열 이름. */
    columns: string[];
    /** 절의 **전체** 데이터 행 수(트림 전). §4.1 — 0이면 "없음"이 아니라 "못 봄"일 수 있다. */
    rowCount: number;
    rows: IntakeBundlePolicyRow[];
    matchedTokens: string[];
}
export interface IntakeBundlePolicyDoc {
    docId: string;
    title: string | null;
    relPath: string;
    /** frontmatter `sourceCommit` — 실측상 도메인 정책서는 **null**(P0b 미완, §9 P0b). */
    sourceCommit: string | null;
    /**
     * frontmatter 가 **선언한** evidenceRate. 측정치(`evidence`)와 **따로** 싣는다 —
     * §4.1 의 policy-authz.md 는 선언값 0 이면서 **행이 0건**이다. 둘을 뭉개면
     * "근거율 0"(=근거 없음)으로 오독된다. 선언 0 + 행수 0 = **"못 봄"**.
     */
    declaredEvidenceRate: number | null;
    /** 문서 전체 데이터 행 수(트림 전). **0이면 스캐너가 못 본 것**(§4.1). */
    rowCount: number;
    sections: IntakeBundlePolicySection[];
    /** `domain`=선정 도메인 조인, `token`=요청 토큰 매치, `shared`=전역 정책서(행 0건 오독 차단용). */
    selectedBy: ('token' | 'domain' | 'shared')[];
    matchedTokens: string[];
    /** 이 문서가 §4.1 의 "빈 산출물"인가 — 행 0건. LLM 에게 명시적으로 알린다. */
    emptyArtifact: boolean;
    /** 측정 근거율(행 기준). rowCount=0 이면 rate=null. */
    evidence: EvidenceStat;
}
export interface IntakeAxis<T> {
    /** 이 축의 소스가 있었나. **false 는 "없음"이 아니라 "못 봄"이다**(§4.1). */
    present: boolean;
    /** 소스 경로(프로젝트 상대) — 없으면 무엇을 못 읽었는지 알린다. */
    source: string;
    /** 소스가 스탬프한 커밋(없으면 null — §5.2 의 스탬프 누수 이력 때문에 실측값을 그대로 싣는다). */
    gitCommit: string | null;
    /** 후보 전체 수(필터 이전). */
    total: number;
    /** 번들에 실린 수. */
    selected: number;
    /** 필터가 골랐으나 캡 때문에 빠진 수. */
    omittedCount: number;
    items: T[];
    reason: string | null;
}
/** 축별 예산 배분 실적 — **왜 이만큼만 실렸나**를 감사 가능하게 남긴다(조용한 누락 금지). */
export interface AxisBudgetReport {
    /** 요구량(트림 전 직렬화 크기). */
    demand: number;
    /** 배분량(floor + 잔여 비례). */
    allocated: number;
    /** 실사용량(트림 후). */
    used: number;
    floor: number;
}
export interface IntakeInputBundle {
    /** v1=P3(3축) · **v2=P4(+화면·정책·pre-cite)**. */
    schemaVersion: 2;
    request: {
        raw: string;
        tokens: string[];
    };
    filter: {
        /** `token`=요청 토큰으로 좁힘, `fallback`=못 좁혀 상위 N(§7 C7), `mixed`=축마다 다름. */
        mode: 'token' | 'fallback' | 'mixed';
        /** 축별 폴백 사유(정직한 보고). */
        fallbacks: string[];
    };
    minimalSet: {
        ok: boolean;
        missing: string[];
    };
    /**
     * **축소 모드**(§10-1) — 최소집합(도메인·데이터·추적표)이 아닌 축(화면·정책)의 부재는
     * **exit 2 가 아니다**. 대신 "없으면 생략하되 **그 사실을 번들에 명시**"한다.
     * 여기 실린 축에 의존하는 결론은 P5 가 `[추정]` 으로 강등한다.
     */
    reducedMode: {
        active: boolean;
        omittedAxes: string[];
        note: string | null;
    };
    commits: {
        domainGraph: string | null;
        dbSchema: string | null;
        crudMatrix: string | null;
        rtm: string | null;
        screens: string | null;
        policy: string | null;
        /** 축 커밋이 전부 같은가. **불일치는 차단하지 않는다**(§10-2) — 사실만 싣는다. */
        consistent: boolean;
        /** 낡은 축 서술(강등 규칙 적용은 P5 소관 — 여기선 사실 기술만). */
        note: string | null;
    };
    axes: {
        domain: IntakeAxis<IntakeBundleDomain> & {
            evidence: EvidenceStat;
        };
        data: {
            schema: IntakeAxis<IntakeBundleTable> & {
                evidence: EvidenceStat;
            };
            crud: IntakeAxis<IntakeBundleCrudRow> & {
                evidence: EvidenceStat;
            };
        };
        rtm: IntakeAxis<IntakeBundleFunction> & {
            evidence: EvidenceStat;
        };
        /** P4 화면 축(축소 모드 — 부재 시 present:false). */
        screens: IntakeAxis<IntakeBundleScreen> & {
            evidence: EvidenceStat;
        };
        /** P4 정책 축(축소 모드 — 부재 시 present:false). */
        policy: IntakeAxis<IntakeBundlePolicyDoc> & {
            evidence: EvidenceStat;
        };
    };
    /** charCap 으로 잘려나간 것 — **조용한 누락 금지**(§6.2 정직한 생략). */
    omitted: string[];
    charCap: {
        limit: number;
        exceeded: boolean;
    };
    /** P4 축별 예산 배분 실적 — 예산 정책이 **감사 가능**해야 조용한 누락이 안 생긴다. */
    budget: Record<AxisBudgetKey, AxisBudgetReport>;
    warnings: string[];
}
/**
 * 요청 원문 → 판별 토큰. 소문자화 → 비단어 분리 → 1글자·불용어 제거.
 *
 * 한국어는 교착어라 형태소 분석 없이 어절만 자르면 "로그인을"이 "로그인"과 안 맞는다.
 * 그래서 매칭은 **부분문자열 포함**(`matchTokens`)으로 한다 — 토큰이 후보 텍스트에 들어있으면 매치.
 * 형태소 분석기를 붙이지 않는 이유: 결정론·무의존성이 LLM 금지 제약보다 앞선다.
 */
export declare function tokenizeRequest(request: string): string[];
/** 최소집합 = **도메인 · 데이터 · 추적표**(§10-1 사용자 결정). 하나라도 없으면 fail-closed. */
export declare function checkMinimalSet(sources: IntakeBundleSources): {
    ok: boolean;
    missing: string[];
};
interface ParsedPolicySection {
    heading: string;
    rank: number;
    columns: string[];
    rows: string[][];
}
/** 정책서 마크다운 → 절 목록(순수 파서 — 표만 뽑는다. 산문은 예산 대비 밀도가 낮아 버린다). */
export declare function parsePolicyMarkdown(md: string): {
    frontmatter: Record<string, string>;
    sections: ParsedPolicySection[];
};
/**
 * 번들의 정규 직렬화 — **디스크에 쓰는 형태**. charCap 은 이 형태를 잰다.
 *
 * ★ 측정과 기록이 어긋나면 캡은 장식이 된다: compact 로 재고 pretty 로 쓰면 실제 파일이 예산의
 *   ~1.75배가 되는데(실측 59,834 → 105,018) LLM 이 읽는 건 **파일 쪽**이다. 그래서 CLI 도
 *   반드시 이 함수로 써야 한다(measure == write).
 */
export declare function serializeIntakeBundle(bundle: IntakeInputBundle): string;
/**
 * **축별 예산 배분(water-fill)** — floor 를 먼저 채우고 잔여를 가중 비례로 나눈다.
 *
 * ★ 이게 P4 의 핵심 안전장치다: floor 가 없으면 "생존"이 **트리머 순서**로 결정돼 어느 한 축이
 *   완전히 고갈된 뒤에야 다음 축이 양보한다(= 화면·정책을 얹으면 pre-cite 가 통째로 날아가는
 *   기계적 원인). floor 는 **모든 축이 자기 pre-cite 코어를 지킨다**를 구조로 보장한다.
 *
 * ★ 수요가 floor 보다 작은 축(또는 부재 축)의 몫은 **풀로 환원**된다 — 그래서 축소 모드
 *   (화면·정책 없음)에선 v1 과 같은 배분으로 자연 수렴한다.
 *
 * 결정론: 키 순회 순서 고정(`AXIS_BUDGET` 선언 순), 정수 연산, 라운딩 정체 시 즉시 종료.
 */
export declare function allocateAxisBudget(demand: Record<AxisBudgetKey, number>, available: number): Record<AxisBudgetKey, number>;
/**
 * 근거 번들 v2 조립(P4) — 5축(도메인·데이터·추적표·**화면·정책**)을 요청 원문으로 사전 필터해
 * 유계 요약하고, 각 근거에 **pre-cite**(실제 스니펫)를 동봉한다.
 *
 * 최소집합 검사는 **호출자가 `checkMinimalSet` 으로 먼저** 한다(fail-closed exit 2 는 CLI 경계 책임).
 * 이 함수는 소스가 없으면 해당 축을 `present:false` 로 정직하게 표시하고 계속한다 —
 * 화면·정책은 최소집합이 아니므로 **부재해도 exit 2 가 아니다**(축소 모드, §10-1).
 */
export declare function buildIntakeInputBundle(sources: IntakeBundleSources, options: BuildIntakeInputOptions): IntakeInputBundle;
export {};
//# sourceMappingURL=intake-bundle.d.ts.map