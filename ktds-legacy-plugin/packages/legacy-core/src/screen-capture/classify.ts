/**
 * ktds legacy-core — 화면 요소 분류/번호 부여(순수 함수, IO·브라우저 없음).
 *
 * 캡처 러너가 추출한 RawElement 를 화면설계서 주석(Annotation)으로 변환한다.
 * - 가시성/크기 필터 + selector 중복 제거.
 * - kind 분류: field(입력) / action(이벤트) / link(내비게이션).
 * - 읽기 순서 정렬(y 8px 양자화 → x) 후 kind 그룹별 카운터로 번호 부여
 *   (field·region = ①②③, action·link = ⓐⓑⓒ — 렌더러가 글리프 결정).
 */
import type { Annotation, AnnotationKind, EventType, RawElement } from './types.js'

/**
 * 배지 글리프 — 대시보드/문서 렌더 공용. 종류별 3계열 분리(카운터도 3분할):
 * - 입력 필드(field/region) → 동그라미 숫자 ①②③
 * - 버튼·이벤트(action)      → 동그라미 소문자 ⓐⓑⓒ
 * - 링크·이동(link)          → 동그라미 대문자 ⒶⒷⒸ
 * 각 계열 범위(50/26/26) 초과 시 렌더러가 "(n)" 폴백.
 */
export const CIRCLED_DIGITS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿'
export const CIRCLED_LETTERS = 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ'
export const CIRCLED_UPPER = 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ'

/** kind+no → 표시 글리프(범위 초과 시 "(n)" 폴백). */
export function badgeGlyph(kind: AnnotationKind, no: number): string {
  const table =
    kind === 'field' || kind === 'region'
      ? CIRCLED_DIGITS
      : kind === 'action'
        ? CIRCLED_LETTERS
        : CIRCLED_UPPER
  const glyph = [...table][no - 1]
  return glyph ?? `(${no})`
}

const MIN_SIZE_PX = 2
const LABEL_MAX = 80

interface Classified {
  kind: AnnotationKind
  eventType: EventType
}

/** 요소 1건의 kind/eventType 분류. 주석 대상이 아니면 null. */
export function classifyKind(e: RawElement): Classified | null {
  const tag = e.tag.toLowerCase()
  const inputType = e.inputType?.toLowerCase() ?? null
  if (tag === 'a' && e.href !== null) {
    if (e.href.trim().toLowerCase().startsWith('javascript:')) {
      return { kind: 'action', eventType: 'click' }
    }
    return { kind: 'link', eventType: 'link' }
  }
  if (tag === 'button') {
    const isSubmit = inputType === null || inputType === 'submit'
    return { kind: 'action', eventType: isSubmit && e.formAction !== null ? 'submit' : 'click' }
  }
  if (tag === 'input') {
    if (inputType === 'hidden') return null
    if (inputType === 'submit' || inputType === 'image') {
      return { kind: 'action', eventType: 'submit' }
    }
    if (inputType === 'button' || inputType === 'reset') {
      return { kind: 'action', eventType: 'click' }
    }
    return { kind: 'field', eventType: 'change' }
  }
  if (tag === 'select' || tag === 'textarea') return { kind: 'field', eventType: 'change' }
  if (e.onclick !== null) return { kind: 'action', eventType: 'click' }
  return null
}

/** 표시 라벨 선택: text → value → alt → placeholder → name → domId → tag. */
export function pickLabel(e: RawElement): string {
  const raw = e.text || e.value || e.alt || e.placeholder || e.name || e.domId || e.tag
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  return collapsed.length > LABEL_MAX ? collapsed.slice(0, LABEL_MAX - 1) + '…' : collapsed
}

function roundBbox(b: RawElement['bbox']): RawElement['bbox'] {
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  }
}

/**
 * RawElement[] → Annotation[] (handler/description/note 는 null — 이후 단계가 채움).
 * 결정론: 동일 입력이면 동일 출력(정렬·번호 안정).
 */
export function classifyElements(elements: RawElement[]): Annotation[] {
  const seen = new Set<string>()
  const picked: Array<{ e: RawElement } & Classified> = []
  for (const e of elements) {
    if (!e.visible || e.disabled) continue
    if (e.bbox.width < MIN_SIZE_PX || e.bbox.height < MIN_SIZE_PX) continue
    if (seen.has(e.selector)) continue
    const c = classifyKind(e)
    if (!c) continue
    seen.add(e.selector)
    picked.push({ e, ...c })
  }
  picked.sort((a, b) => {
    const ya = Math.round(a.e.bbox.y / 8)
    const yb = Math.round(b.e.bbox.y / 8)
    if (ya !== yb) return ya - yb
    if (a.e.bbox.x !== b.e.bbox.x) return a.e.bbox.x - b.e.bbox.x
    return a.e.selector.localeCompare(b.e.selector)
  })
  // 종류별 독립 카운터 — 입력·버튼·링크가 각각 1부터 시작(예시 슬라이드 관례).
  let fieldNo = 0
  let actionNo = 0
  let linkNo = 0
  return picked.map(({ e, kind, eventType }) => ({
    no:
      kind === 'field' || kind === 'region'
        ? ++fieldNo
        : kind === 'action'
          ? ++actionNo
          : ++linkNo,
    kind,
    selector: e.selector,
    bbox: roundBbox(e.bbox),
    label: pickLabel(e),
    eventType,
    mechanical: {
      tag: e.tag.toLowerCase(),
      inputType: e.inputType?.toLowerCase() ?? null,
      name: e.name,
      href: e.href,
      formAction: e.formAction,
      formMethod: e.formMethod?.toUpperCase() ?? null,
      onclick: e.onclick,
      required: e.required,
    },
    handler: null,
    description: null,
    note: null,
  }))
}
