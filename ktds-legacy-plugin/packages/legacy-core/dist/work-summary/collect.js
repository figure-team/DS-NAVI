/**
 * git 작업 이력 수집(W6) — `git log --numstat` 1회 실행으로 커밋 헤더+파일 변경을
 * 동시 파싱. churn.ts(W4) 관례의 일반화: 커밋 단위 보존(집계는 build 단계).
 *
 * 결정론: HEAD 가 같으면 이력이 같다 — 리포트가 headSha 앵커를 기록해 동일 commit
 * 재실행 byte-diff=0. shallow clone 은 잘린 이력이 클론마다 달라 결정론을 깨므로
 * 'shallow' 로 degrade(W4 R1 관례). 정렬은 git 출력 순서에 의존하지 않고 build
 * 단계에서 명시 재정렬한다.
 *
 * 날짜 축 = committer date(%cI): cherry-pick/rebase 후에도 "이 기간에 랜딩됐다"가
 * 실적 기준(author date 는 원 작성 시점이라 보고 주간과 어긋남). 작성자는 이름만
 * 수집한다(%an — 이메일 미수집, PII 최소화).
 *
 * projectRoot 가 레포 하위 디렉터리인 경우(모노레포 vendored) `rev-parse --show-prefix`
 * 로 접두어를 벗겨 census relPath 좌표계로 맞추고, pathspec `-- .` 으로 하위만
 * 수집한다 — 이때 git 경로 단순화로 머지 커밋이 생략될 수 있음(문서 §2 한계 명기).
 * 레포 루트가 곧 projectRoot 면 pathspec 없이 전체 커밋(머지 포함)을 수집한다
 * (수용 기준: 커밋 목록이 `git log` 실물과 일치).
 */
import { execFileSync } from 'node:child_process';
function git(projectRoot, args) {
    return execFileSync('git', ['-C', projectRoot, '-c', 'core.quotepath=false', ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 256 * 1024 * 1024,
    });
}
/** 레코드/필드 구분자 — 커밋 제목에 등장할 수 없는 제어문자. */
const RS = '\x1e';
const FS = '\x1f';
/**
 * 커밋+numstat 수집. revRange(`A..B`)를 주면 해당 집합만, sinceIso 를 주면 그 이후만,
 * 둘 다 없으면 전체 이력. 잘못된 revRange 는 no-git 으로 수렴한다 — 호출자(스크립트)가
 * rev-parse 로 사전 검증해 사용자 오류를 구분 표면화한다.
 * 한계(리뷰 R7/R8, 백로그): 커밋 제목에 RS(\x1e) 제어문자가 있으면 해당 레코드가 중간
 * 분할되고, 경로에 탭/개행 등 제어문자가 있으면 git 이 C-스타일 인용을 해 매칭이
 * 어긋난다 — 소스 제목/파일명에선 사실상 미발생(churn R7 과 동일 판단).
 */
export function collectWorkLog(projectRoot, opts) {
    const revRange = opts?.revRange;
    // git 옵션 인젝션 방지(리뷰 R2) — 이 함수는 공개 API 라 rev 범위만 허용한다.
    if (revRange !== undefined && revRange.startsWith('-')) {
        throw new Error(`revRange 는 rev 범위(A..B)만 허용: ${JSON.stringify(revRange)}`);
    }
    if (opts?.sinceIso !== undefined && opts.sinceIso.startsWith('-')) {
        throw new Error(`sinceIso 는 ISO 시각만 허용: ${JSON.stringify(opts.sinceIso)}`);
    }
    let headSha;
    let headDateIso;
    let prefix;
    let raw;
    try {
        if (git(projectRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
            return { kind: 'shallow' };
        }
        headSha = git(projectRoot, ['rev-parse', 'HEAD']).trim();
        headDateIso = git(projectRoot, ['show', '-s', '--format=%cI', 'HEAD']).trim();
        prefix = git(projectRoot, ['rev-parse', '--show-prefix']).trim();
        const logArgs = [
            'log',
            ...(revRange ? [revRange] : []),
            ...(opts?.sinceIso ? [`--since=${opts.sinceIso}`] : []),
            '--numstat',
            '--no-renames',
            `--format=${RS}%H${FS}%cI${FS}%an${FS}%P${FS}%s`,
            // 하위 디렉터리 프로젝트만 pathspec 으로 좁힌다(위 주석의 머지 생략 한계 참조).
            ...(prefix ? ['--', '.'] : []),
        ];
        raw = git(projectRoot, logArgs);
    }
    catch (err) {
        // 256MB 상한 초과는 "git 없음"과 다르다 — 사유를 구분해 오진단을 막는다(리뷰 C3).
        const msg = err instanceof Error ? err.message : '';
        if (err.code === 'ENOBUFS' || msg.includes('maxBuffer')) {
            return { kind: 'too-large' };
        }
        return { kind: 'no-git' };
    }
    const commits = [];
    for (const record of raw.split(RS)) {
        if (record.trim().length === 0)
            continue;
        const lines = record.split('\n');
        const header = lines[0].split(FS);
        if (header.length < 5)
            continue;
        const [sha, dateIso, author, parents] = header;
        // %s 는 개행을 제거하지만 FS 가 제목에 있진 않다는 전제 — 초과 필드는 제목에 복원.
        const subject = header.slice(4).join(FS);
        const files = [];
        for (const line of lines.slice(1)) {
            // numstat 행: `<added>\t<deleted>\t<path>` (바이너리는 `-\t-\t<path>`).
            const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
            if (!m)
                continue;
            const repoPath = m[3];
            if (prefix && !repoPath.startsWith(prefix))
                continue;
            files.push({
                path: prefix ? repoPath.slice(prefix.length) : repoPath,
                added: m[1] === '-' ? 0 : Number(m[1]),
                deleted: m[2] === '-' ? 0 : Number(m[2]),
            });
        }
        files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        commits.push({
            sha,
            dateIso,
            author,
            subject,
            isMerge: parents.trim().split(/\s+/).filter(Boolean).length >= 2,
            files,
        });
    }
    return { kind: 'ok', headSha, headDateIso, prefix, commits };
}
//# sourceMappingURL=collect.js.map