// load-lexicon.mjs — fill-merge 용 표기 통일 렉시콘 로더(공용).
//
// 우선순위: 프로젝트 override(.understand-anything/templates/style/ko-lexicon.md,
// 있으면 단독 적용) → 플러그인 동봉(templates/style/ko-lexicon.md) → 없음(치환 생략).
// 파싱은 engine(parseLexicon — legacy-core 순수 함수)에 위임한다. 파싱 실패는
// 조용히 삼키지 않고 error 로 돌려 호출자가 보고하게 한다(조용한 누락 금지).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function loadLexicon(engine, projectRoot, pluginRoot) {
  const override = join(projectRoot, '.understand-anything', 'templates', 'style', 'ko-lexicon.md')
  const bundled = join(pluginRoot, 'templates', 'style', 'ko-lexicon.md')
  const path = existsSync(override) ? override : existsSync(bundled) ? bundled : null
  if (!path) return { lexicon: undefined, path: null, error: null }
  try {
    return { lexicon: engine.parseLexicon(readFileSync(path, 'utf8')), path, error: null }
  } catch (err) {
    return { lexicon: undefined, path, error: err?.message ?? String(err) }
  }
}
