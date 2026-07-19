/**
 * missing 트리아지(T1) + census 보조 시드(T2) — SCREENS_MISSING_TRIAGE_DESIGN §2·§3.
 * egov 공통컴포넌트 실측 25건(2026-07-18, gitCommit d9373e54)을 픽스처로 동결 —
 * routes 는 판정에 필요한 same-dir 부분집합(실제 routes.json 값 그대로).
 */
import { describe, expect, it } from 'vitest'
import {
  findCandidateRoute,
  leafTokens,
  selectCensusSeeds,
  triageMissing,
  type CensusRoute,
} from './triage.js'
import type { MissingScreen } from './types.js'

const r = (path: string, extra: Partial<CensusRoute> = {}): CensusRoute => ({
  path,
  method: 'ANY',
  handler: null,
  filePath: null,
  line: null,
  ...extra,
})

/** egov routes.json 부분집합 — 25건 판정에 관여하는 same-dir 라우트들(실측 값). */
const EGOV_ROUTES: CensusRoute[] = [
  // cop/bbs — 대소문자만 다른 실존 라우트(케이스 리네임)
  r('/cop/bbs/selectBBSMasterInfs.do'),
  r('/cop/bbs/selectArticleList.do'),
  r('/cop/bbs/deleteBBSMaster.do'),
  // cop/cmy — cmmnty→commu 리네임이라 토큰 불일치(후보 없음이 정답)
  r('/cop/cmy/cmmntyMain.do'),
  r('/cop/cmy/selectCommuMasterList.do'),
  // cop/com — BBSUseInfs 제거됨
  r('/cop/com/openPopup.do'),
  r('/cop/com/selectUserList.do'),
  // cop/scp — Scrap→ArticleScrap 리네임
  r('/cop/scp/selectArticleScrapList.do'),
  r('/cop/scp/selectArticleScrapDetail.do'),
  r('/cop/scp/deleteArticleScrap.do'),
  // sts/dst — 요청 URL 실존(필수 파라미터 400) + 정식 진입점 ListView
  r('/sts/dst/selectDtaUseStatsList.do', {
    handler: 'EgovDtaUseStatsContoller#selectDtaUseStatsList',
  }),
  r('/sts/dst/selectDtaUseStatsListView.do'),
  // sym/ccm 3형제 — Egov*List → Select*List 리네임
  r('/sym/ccm/cca/SelectCcmCmmnCodeList.do', {
    handler: 'EgovCcmCmmnCodeManageController#selectCmmnCodeList',
    filePath:
      'src/main/java/egovframework/com/sym/ccm/cca/web/EgovCcmCmmnCodeManageController.java',
    line: 72,
  }),
  r('/sym/ccm/cca/SelectCcmCmmnCodeDetail.do'),
  r('/sym/ccm/cca/RegistCcmCmmnCodeView.do'),
  r('/sym/ccm/ccc/SelectCcmCmmnClCodeList.do'),
  r('/sym/ccm/ccc/SelectCcmCmmnClCodeDetail.do'),
  r('/sym/ccm/cde/SelectCcmCmmnDetailCodeList.do'),
  r('/sym/ccm/cde/SelectCcmCmmnDetailCodeDetail.do'),
  // sym/log/tlg — 요청 URL 실존(런타임 500)
  r('/sym/log/tlg/SelectTrsmrcvLogList.do'),
  r('/sym/log/tlg/InsertTrsmrcvLog.do'),
  // uat/uia — 실존 + 로그인 리다이렉트
  r('/uat/uia/egovGpkiIssu.do'),
  r('/uat/uia/actionLogin.do'),
  // uss/ion/ecc — 동률 타이브레이크(Popup 잉여 토큰)
  r('/uss/ion/ecc/selectEventCmpgnList.do'),
  r('/uss/ion/ecc/selectEventCmpgnListPopup.do'),
  r('/uss/ion/ecc/selectTnextrlHrList.do'),
  // uss/ion/nws·rec·sit
  r('/uss/ion/nws/selectNewsList.do'),
  r('/uss/ion/nws/selectNewsDetail.do'),
  r('/uss/ion/rec/selectRecomendSiteList.do'),
  r('/uss/ion/sit/selectSiteList.do'),
  // uss/ion/uas — 동률 타이브레이크(MainList 잉여 토큰)
  r('/uss/ion/uas/selectUserAbsnceList.do'),
  r('/uss/ion/uas/selectUserAbsnceMainList.do'),
  r('/uss/ion/uas/removeUserAbsnceList.do'),
  // uss/mpe — Indvdlpge(붙은 토큰) vs IndvdlPge(쪼개진 토큰) — 매칭 불가가 정답(fail-closed)
  r('/uss/mpe/selectIndvdlPgeList.do'),
  // uss/olh/awm — Word / WordManage 쌍이 각자 제 후보로
  r('/uss/olh/awm/selectAdministrationWordList.do'),
  r('/uss/olh/awm/selectAdministrationWordManageList.do'),
  r('/uss/olh/awm/selectAdministrationWordManageDetail.do'),
  // uss/olh/faq·hpc·qna·wor
  r('/uss/olh/faq/selectFaqList.do'),
  r('/uss/olh/hpc/selectHpcmList.do'),
  r('/uss/olh/qna/selectQnaList.do'),
  r('/uss/olh/qna/selectQnaAnswerList.do'),
  r('/uss/olh/wor/selectWordDicaryList.do'),
  // uss/umt — EntrprsMber 제거; Emplyr 는 도메인 단어 불일치(범용 manage 만 공통 → 후보 없음)
  r('/uss/umt/EgovEmplyrManage.do'),
  r('/uss/umt/EgovEmplyrDelete.do'),
]

/** egov screens.json missing 25건(실측 그대로). */
const EGOV_MISSING: MissingScreen[] = [
  { url: 'cop/bbs/SelectBBSMasterInfs.do', reason: 'http-404' },
  { url: 'cop/cmy/selectCmmntyInfs.do', reason: 'http-404' },
  { url: 'cop/com/selectBBSUseInfs.do', reason: 'http-404' },
  { url: 'cop/scp/selectScrapList.do', reason: 'http-404' },
  { url: 'sts/dst/selectDtaUseStatsList.do', reason: 'http-400' },
  { url: 'sym/ccm/cca/EgovCcmCmmnCodeList.do', reason: 'http-404' },
  { url: 'sym/ccm/ccc/EgovCcmCmmnClCodeList.do', reason: 'http-404' },
  { url: 'sym/ccm/cde/EgovCcmCmmnDetailCodeList.do', reason: 'http-404' },
  { url: 'sym/log/tlg/SelectTrsmrcvLogList.do', reason: 'http-500' },
  { url: 'uat/uia/egovGpkiIssu.do', reason: 'redirected-to:uat/uia/egovLoginUsr.do' },
  { url: 'uss/ion/ecc/EgovEventCmpgnList.do', reason: 'http-404' },
  { url: 'uss/ion/ecc/EgovTnextrlHrInfoList.do', reason: 'http-404' },
  { url: 'uss/ion/nws/NewsInfoListInqire.do', reason: 'http-404' },
  { url: 'uss/ion/rec/RecomendSiteListInqire.do', reason: 'http-404' },
  { url: 'uss/ion/sit/SiteListInqire.do', reason: 'http-404' },
  { url: 'uss/ion/uas/selectUserAbsnceListView.do', reason: 'http-404' },
  { url: 'uss/mpe/EgovIndvdlpgeCntntsList.do', reason: 'http-404' },
  { url: 'uss/olh/awm/listAdministrationWord.do', reason: 'http-404' },
  { url: 'uss/olh/awm/listAdministrationWordManage.do', reason: 'http-404' },
  { url: 'uss/olh/faq/FaqListInqire.do', reason: 'http-404' },
  { url: 'uss/olh/hpc/HpcmListInqire.do', reason: 'http-404' },
  { url: 'uss/olh/qna/QnaListInqire.do', reason: 'http-404' },
  { url: 'uss/olh/qnm/QnaAnswerListInqire.do', reason: 'http-404' },
  { url: 'uss/olh/wor/WordDicaryListInqire.do', reason: 'http-404' },
  { url: 'uss/umt/EgovEntrprsMberManage.do', reason: 'http-404' },
]

/** 실측 검수 결과(2026-07-19 알고리즘 확정 시 동결) — url → [class, 후보 path|null]. */
const EXPECTED: Record<string, [string, string | null]> = {
  'cop/bbs/SelectBBSMasterInfs.do': ['stale-url', '/cop/bbs/selectBBSMasterInfs.do'],
  'cop/cmy/selectCmmntyInfs.do': ['dead-menu', null],
  'cop/com/selectBBSUseInfs.do': ['dead-menu', null],
  'cop/scp/selectScrapList.do': ['stale-url', '/cop/scp/selectArticleScrapList.do'],
  'sts/dst/selectDtaUseStatsList.do': ['param-required', null],
  'sym/ccm/cca/EgovCcmCmmnCodeList.do': ['stale-url', '/sym/ccm/cca/SelectCcmCmmnCodeList.do'],
  'sym/ccm/ccc/EgovCcmCmmnClCodeList.do': [
    'stale-url',
    '/sym/ccm/ccc/SelectCcmCmmnClCodeList.do',
  ],
  'sym/ccm/cde/EgovCcmCmmnDetailCodeList.do': [
    'stale-url',
    '/sym/ccm/cde/SelectCcmCmmnDetailCodeList.do',
  ],
  'sym/log/tlg/SelectTrsmrcvLogList.do': ['server-error', null],
  'uat/uia/egovGpkiIssu.do': ['auth-gated', null],
  'uss/ion/ecc/EgovEventCmpgnList.do': ['stale-url', '/uss/ion/ecc/selectEventCmpgnList.do'],
  'uss/ion/ecc/EgovTnextrlHrInfoList.do': ['stale-url', '/uss/ion/ecc/selectTnextrlHrList.do'],
  'uss/ion/nws/NewsInfoListInqire.do': ['stale-url', '/uss/ion/nws/selectNewsList.do'],
  'uss/ion/rec/RecomendSiteListInqire.do': ['stale-url', '/uss/ion/rec/selectRecomendSiteList.do'],
  'uss/ion/sit/SiteListInqire.do': ['stale-url', '/uss/ion/sit/selectSiteList.do'],
  'uss/ion/uas/selectUserAbsnceListView.do': ['stale-url', '/uss/ion/uas/selectUserAbsnceList.do'],
  'uss/mpe/EgovIndvdlpgeCntntsList.do': ['dead-menu', null],
  'uss/olh/awm/listAdministrationWord.do': [
    'stale-url',
    '/uss/olh/awm/selectAdministrationWordList.do',
  ],
  'uss/olh/awm/listAdministrationWordManage.do': [
    'stale-url',
    '/uss/olh/awm/selectAdministrationWordManageList.do',
  ],
  'uss/olh/faq/FaqListInqire.do': ['stale-url', '/uss/olh/faq/selectFaqList.do'],
  'uss/olh/hpc/HpcmListInqire.do': ['stale-url', '/uss/olh/hpc/selectHpcmList.do'],
  'uss/olh/qna/QnaListInqire.do': ['stale-url', '/uss/olh/qna/selectQnaList.do'],
  'uss/olh/qnm/QnaAnswerListInqire.do': ['dead-menu', null],
  'uss/olh/wor/WordDicaryListInqire.do': ['stale-url', '/uss/olh/wor/selectWordDicaryList.do'],
  'uss/umt/EgovEntrprsMberManage.do': ['dead-menu', null],
}

const LOGIN = { loginPaths: ['/uat/uia/egovLoginUsr.do'] }

describe('leafTokens', () => {
  it('camelCase 분해 + 소문자 + 확장자 제거 + egov 브랜딩 제거', () => {
    expect(leafTokens('selectQnaList.do')).toEqual(['select', 'qna', 'list'])
    expect(leafTokens('EgovCcmCmmnCodeList.do')).toEqual(['ccm', 'cmmn', 'code', 'list'])
    expect(leafTokens('QnaListInqire.do')).toEqual(['qna', 'list', 'inqire'])
    expect(leafTokens('list_administration-word.jsp')).toEqual(['list', 'administration', 'word'])
  })
})

describe('findCandidateRoute (§2.2)', () => {
  it('동률 재현율은 정밀도로 가른다 — selectQnaList ≻ selectQnaAnswerList', () => {
    expect(findCandidateRoute('uss/olh/qna/QnaListInqire.do', EGOV_ROUTES)?.path).toBe(
      '/uss/olh/qna/selectQnaList.do',
    )
  })
  it('다른 디렉터리 라우트는 후보가 아니다(qnm — qna 에 답변 목록이 있어도 무시)', () => {
    expect(findCandidateRoute('uss/olh/qnm/QnaAnswerListInqire.do', EGOV_ROUTES)).toBeNull()
  })
  it('범용 토큰만 겹치면 후보 없음 — EntrprsMberManage ↛ EmplyrManage(manage 만 공통)', () => {
    expect(findCandidateRoute('uss/umt/EgovEntrprsMberManage.do', EGOV_ROUTES)).toBeNull()
  })
  it('붙은 토큰(Indvdlpge)은 쪼개진 후보(IndvdlPge)와 매칭 불가 — fail-closed', () => {
    expect(findCandidateRoute('uss/mpe/EgovIndvdlpgeCntntsList.do', EGOV_ROUTES)).toBeNull()
  })
  it('후보의 handler/filePath/line 을 그대로 전달한다', () => {
    const c = findCandidateRoute('sym/ccm/cca/EgovCcmCmmnCodeList.do', EGOV_ROUTES)
    expect(c).toEqual({
      path: '/sym/ccm/cca/SelectCcmCmmnCodeList.do',
      handler: 'EgovCcmCmmnCodeManageController#selectCmmnCodeList',
      filePath:
        'src/main/java/egovframework/com/sym/ccm/cca/web/EgovCcmCmmnCodeManageController.java',
      line: 72,
    })
  })
})

describe('triageMissing — egov 실측 25건 픽스처 (§2.1)', () => {
  const triaged = triageMissing(EGOV_MISSING, EGOV_ROUTES, LOGIN)

  it('전 건에 triage 가 부여된다(입력은 불변)', () => {
    expect(triaged).toHaveLength(25)
    expect(triaged.every((m) => m.triage != null)).toBe(true)
    expect(EGOV_MISSING.every((m) => m.triage === undefined)).toBe(true)
  })

  it.each(Object.entries(EXPECTED))('%s → %s', (url, [cls, candidate]) => {
    const m = triaged.find((x) => x.url === url)
    expect(m?.triage?.class).toBe(cls)
    expect(m?.triage?.candidateRoute?.path ?? null).toBe(candidate)
  })

  it('분류 집계: stale-url 17 / dead-menu 5 / param-required 1 / server-error 1 / auth-gated 1', () => {
    const counts: Record<string, number> = {}
    for (const m of triaged) counts[m.triage!.class] = (counts[m.triage!.class] ?? 0) + 1
    expect(counts).toEqual({
      'stale-url': 17,
      'dead-menu': 5,
      'param-required': 1,
      'server-error': 1,
      'auth-gated': 1,
    })
  })

  it('routeExists — 실존인데 404 면 route-missing-hit', () => {
    const t = triageMissing(
      [{ url: 'sym/ccm/cca/SelectCcmCmmnCodeList.do', reason: 'http-404' }],
      EGOV_ROUTES,
      LOGIN,
    )
    expect(t[0].triage).toMatchObject({ class: 'route-missing-hit', routeExists: true })
  })

  it('로그인 아닌 곳으로의 리다이렉트는 redirect-other', () => {
    const t = triageMissing(
      [{ url: 'uat/uia/egovGpkiIssu.do', reason: 'redirected-to:cop/smt/EgovMain.do' }],
      EGOV_ROUTES,
      LOGIN,
    )
    expect(t[0].triage?.class).toBe('redirect-other')
  })

  it('scenario-failed / goto-failed 는 unknown', () => {
    const t = triageMissing(
      [
        { url: 'scenario:business-user', reason: 'scenario-failed: timeout' },
        { url: 'cop/bbs/x.do', reason: 'goto-failed: net::ERR' },
      ],
      EGOV_ROUTES,
      LOGIN,
    )
    expect(t.map((x) => x.triage?.class)).toEqual(['unknown', 'unknown'])
  })
})

describe('selectCensusSeeds — GET-safe 게이트 (§3)', () => {
  it('deny 토큰(위치 무관)은 항상 제외 — insert/delete/regist/action/remove', () => {
    const seeds = selectCensusSeeds([
      r('/uss/olh/qna/insertQnaView.do'),
      r('/uss/ion/ecc/deleteEventCmpgn.do'),
      r('/sym/ccm/cca/RegistCcmCmmnCodeView.do'),
      r('/uat/uia/actionMain.do'),
      r('/uss/ion/uas/removeUserAbsnceList.do'),
      r('/uat/uia/actionLogin.do'),
      r('/uat/uia/actionLogout.do'),
    ])
    expect(seeds).toEqual([])
  })

  it('목록성 진입점만 허용 — List/ListView/Main/Index (상세·단건은 파라미터 소음이라 제외)', () => {
    const seeds = selectCensusSeeds([
      r('/uss/olh/qna/selectQnaList.do'),
      r('/sts/dst/selectDtaUseStatsListView.do'),
      r('/cop/smt/EgovMain.do'),
      r('/sym/mnu/mpm/EgovMainMenuIndex.do'),
      r('/uss/olh/qna/selectQnaDetail.do'),
      r('/cmm/fms/getImage.do'),
      r('/cop/com/openPopup.do'),
    ])
    expect(seeds.map((s) => s.path)).toEqual([
      '/cop/smt/EgovMain.do',
      '/sts/dst/selectDtaUseStatsListView.do',
      '/sym/mnu/mpm/EgovMainMenuIndex.do',
      '/uss/olh/qna/selectQnaList.do',
    ])
  })

  it('method GET/ANY(미기재 포함)만 — POST 제외', () => {
    const seeds = selectCensusSeeds([
      r('/a/xList.do', { method: 'POST' }),
      r('/a/yList.do', { method: 'GET' }),
      r('/a/zList.do', { method: null }),
    ])
    expect(seeds.map((s) => s.path)).toEqual(['/a/yList.do', '/a/zList.do'])
  })

  it('패턴 경로({}·*·정규식) 제외 + path 중복 제거 + ASC 정렬', () => {
    const seeds = selectCensusSeeds([
      r('/b/itemList.do'),
      r('/a/{id}/xList.do'),
      r('/a/*/yList.do'),
      r('/b/itemList.do'),
      r('/a/mainList.do'),
    ])
    expect(seeds.map((s) => s.path)).toEqual(['/a/mainList.do', '/b/itemList.do'])
  })

  it('visited/excluded 콜백으로 제외한다', () => {
    const seeds = selectCensusSeeds(
      [r('/a/xList.do'), r('/a/yList.do'), r('/a/zList.do')],
      {
        isVisited: (p) => p === 'a/xList.do',
        isExcluded: (p) => p === 'a/zList.do',
      },
    )
    expect(seeds.map((s) => s.path)).toEqual(['/a/yList.do'])
  })

  it('egov 실측: 회수 대상 신 URL 들이 시드로 선별된다', () => {
    const seeds = selectCensusSeeds(EGOV_ROUTES).map((s) => s.path)
    for (const p of [
      '/uss/olh/qna/selectQnaList.do',
      '/uss/olh/faq/selectFaqList.do',
      '/sym/ccm/cca/SelectCcmCmmnCodeList.do',
      '/cop/scp/selectArticleScrapList.do',
      '/sts/dst/selectDtaUseStatsListView.do',
      '/uss/mpe/selectIndvdlPgeList.do',
    ]) {
      expect(seeds).toContain(p)
    }
    // 부작용 계열·상세 화면은 없어야 한다.
    expect(seeds.some((p) => /insert|delete|regist|action|remove/i.test(p))).toBe(false)
    expect(seeds).not.toContain('/uss/ion/nws/selectNewsDetail.do')
  })
})
