// SKILL.md(단일 소스) → opencode command/.md 생성기.
//
// Claude 스킬(skills/*/SKILL.md)을 opencode 커맨드로 변환한다. 이 스크립트를 install 시점에
// 돌리므로, 스킬을 고치거나 새로 추가하면 재설치만으로 opencode 에 자동 반영된다(복사본 드리프트 제거).
//
// 변환 규칙:
//   - ktds 스킬: 본문 `${CLAUDE_PLUGIN_ROOT}` → `$ATLAS_PLUGIN_ROOT` (플러그인이 주입)
//   - U-A 스킬 : 본문 무수정 (플러그인이 `CLAUDE_PLUGIN_ROOT`=U-A 루트를 주입해 해소)
//   - 공통     : frontmatter 는 description 만 남김(YAML 안전), 첫 H1 뒤 opencode 런타임 노트 삽입
//   - understand-onboard 는 ktds(가이드 1-명령 온보딩)가 U-A 동명 스킬을 대체(이름 충돌 회피)
//
// 사용법:  node gen-commands.mjs --ktds <ktds/skills> --ua <ua/skills> --out <.opencode/command>
//          node gen-commands.mjs --list      # 생성할 커맨드 이름만 출력(uninstall 용)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

const KTDS = [
  "understand-init", "understand-map", "understand-onboard", "understand-impact",
  "understand-docs", "understand-policy", "understand-rtm",
]
const UA = [
  "understand", "understand-dashboard", "understand-domain",
  "understand-explain", "understand-diff", "understand-chat", "understand-knowledge",
]

const NOTE_KTDS =
  "> 🧩 **opencode 런타임:** 번들 스크립트는 `$ATLAS_PLUGIN_ROOT/scripts/*.mjs` 로 호출한다" +
  "(atlas 플러그인이 셸에 ATLAS_PLUGIN_ROOT 를 주입). `<projectRoot>` 는 인자의 해당 토큰," +
  " 없으면 현재 작업 디렉터리."
const NOTE_UA =
  "> 🧩 **opencode 런타임:** 이 플러그인이 셸에 `CLAUDE_PLUGIN_ROOT`(=understand-anything 번들 루트)" +
  "·`UA_PLUGIN_ROOT`·`ATLAS_PLUGIN_ROOT` 를 주입한다. 본문의 `${CLAUDE_PLUGIN_ROOT}` 경로 해소는 그대로 동작한다."

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

if (args.includes("--list")) {
  console.log([...KTDS, ...UA].join("\n"))
  process.exit(0)
}

const ktdsSkills = opt("--ktds")
const uaSkills = opt("--ua")
const out = opt("--out")
if (!out) { console.error("gen-commands: --out <dir> 필요"); process.exit(1) }
mkdirSync(out, { recursive: true })

function extractDesc(fm) {
  const dm = fm.match(/description:\s*([\s\S]*?)(?:\n[a-zA-Z_-]+:|$)/)
  return dm ? dm[1].trim() : ""
}
function yamlDesc(d) {
  const needs = /[:#[\]{}&*!|>'"%@`]/.test(d) || d.includes(" — ")
  return needs ? `"${d.replace(/"/g, '\\"')}"` : d
}
function insertNote(body, note) {
  const lines = body.split("\n")
  const h1 = lines.findIndex((l) => /^#\s/.test(l))
  if (h1 >= 0) { lines.splice(h1 + 1, 0, "", note); return lines.join("\n") }
  return note + "\n\n" + body
}
function convert(srcFile, { replaceVar, note }) {
  const raw = readFileSync(srcFile, "utf8")
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error("frontmatter 파싱 실패: " + srcFile)
  let body = m[2]
  if (replaceVar) body = body.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "$ATLAS_PLUGIN_ROOT")
  body = insertNote(body, note)
  const desc = yamlDesc(extractDesc(m[1]))
  return `---\ndescription: ${desc}\n---\n${body.startsWith("\n") ? body : "\n" + body}`
}

let n = 0
const gen = (skillsDir, names, cfg) => {
  if (!skillsDir) return
  for (const name of names) {
    const f = join(skillsDir, name, "SKILL.md")
    if (!existsSync(f)) { console.error(`  · skip(소스 없음): ${name}`); continue }
    writeFileSync(join(out, `${name}.md`), convert(f, cfg))
    n++
  }
}
gen(ktdsSkills, KTDS, { replaceVar: true, note: NOTE_KTDS })
gen(uaSkills, UA, { replaceVar: false, note: NOTE_UA })
console.log(`✓ 커맨드 ${n}개 생성 → ${out} (단일 소스: SKILL.md)`)
