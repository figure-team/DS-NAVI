// CLI 공통 헬퍼 — understand-*.mjs가 각자 복붙하던 보일러플레이트의 단일 출처(리팩토링 2026-06).
import { join } from "node:path";

/** `... | head`처럼 reader가 먼저 닫히면 stdout EPIPE가 throw된다 — 정상 종료로 흡수. */
export function installEpipeGuard() {
  process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });
}

/**
 * 공통 argv 파싱. 첫 인자가 플래그도 서브커맨드도 아니면 projectRoot로, 아니면 cwd.
 * @param {string[]} subs 서브커맨드 목록(root 판별에서 제외).
 * @returns {{root:string, rest:string[], sub:string|undefined, flag:(n:string)=>string|undefined, has:(n:string)=>boolean, spec:string}}
 */
export function parseArgv(subs = []) {
  const argv = process.argv.slice(2);
  const root = argv[0] && !argv[0].startsWith("-") && !subs.includes(argv[0]) ? argv[0] : process.cwd();
  const rest = argv[0] === root ? argv.slice(1) : argv;
  const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  const has = (n) => rest.includes(n);
  return { root, rest, sub: rest[0], flag, has, spec: join(root, ".spec") };
}

/**
 * --by 핸들 **필수** 검증: 비어있거나 '-'로 시작하면 거부. `--by --all`처럼 다른 플래그가
 * 핸들로 오인돼 의도치 않은 일괄 처리로 새는 것을 막는다(O3 핸들 무결성). confirm/approve용.
 */
export function assertRequiredHandle(by, usage) {
  if (!by || by.startsWith("-")) {
    throw new Error(`usage: ${usage} (핸들은 비어있거나 '-'로 시작할 수 없음)`);
  }
}

/**
 * --by 핸들 **선택** 검증: undefined는 허용(핸들 생략 가능), 주어지면 비거나 '-' 시작 거부.
 * impact/review처럼 --by가 선택 인자인 명령용.
 */
export function assertOptionalHandle(by, usage) {
  if (by !== undefined && (by === "" || by.startsWith("-"))) {
    throw new Error(`usage: ${usage} (핸들은 비어있거나 '-'로 시작할 수 없음)`);
  }
}

/** POSIX 상대경로의 마지막 세그먼트(엔진이 내보내는 '/' 구분 경로 — OS 무관). */
export function basename(p) {
  return p.split("/").pop();
}

/** 소수 1자리 반올림(정확도 하네스 출력용). */
export function round1(n) {
  return Math.round(n * 10) / 10;
}
