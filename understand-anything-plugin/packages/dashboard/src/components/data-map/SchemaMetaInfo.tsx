import { useState } from "react";

import InfoPopover, { type InfoRow } from "../InfoPopover";
import { UnresolvedModal } from "./UnresolvedChips";
import type { DbSchema } from "./types";

/**
 * 데이터 맵 스캔 정보 — 범용 InfoPopover(ⓘ 정보 팝오버) 위에 얹은 데이터 전용 래퍼.
 * 산출물·Tier·테이블 수·SQL 파일 수를 ⓘ 뒤로 접고, TopBar 슬롯에는 [미해결/참고] 칩만 남긴다
 * (2026-07-15, 명칭 확정 후 InfoPopover 로 추출).
 */

/** Tier(분석 등급) 값별 한 줄 설명 — 자산 게이팅: ddl+data > ddl > code-inferred > code-only. */
const TIER_DESC: Record<string, string> = {
  "ddl+data": "DDL(테이블 구조) + dataload(데이터 행) 모두 확보 — 최상위·권위 소스",
  ddl: "DDL(테이블 구조)만 확보, 데이터 행 없음",
  "code-inferred":
    ".sql 부재 → JPA/MyBatis 코드 역추론으로 채운 구조 근사(비권위, DDL 확보 시 자동 대체)",
  "code-only": "구조 추출·역추론 모두 실패(코드 신호만)",
};

function tierHint(tier: string | undefined): string {
  const key = tier?.toLowerCase() ?? "";
  const head = "분석 등급 — 발견한 DB 자산에 따라 결정(자산 게이팅): ddl+data > ddl > code-inferred > code-only.";
  const cur = TIER_DESC[key];
  return cur ? `${head}\n현재 ${tier?.toUpperCase()} — ${cur}` : head;
}

export default function SchemaMetaInfo({ schema }: { schema: DbSchema }) {
  const [infoOpen, setInfoOpen] = useState(false);
  // 참고(info)는 무해 신호라 다른 메타와 같은 행으로 넣고, 건수를 누르면 사유·근거 모달을
  // 연다 — 미해결(warn)만 TopBar 에 칩으로 노출(2026-07-15 사용자 결정).
  const infos = (schema.unresolved ?? []).filter((u) => u.severity === "info");

  const rows: InfoRow[] = [
    { label: "산출물", value: "db-schema.json" },
    { label: "Tier", value: schema.tier?.toUpperCase() ?? "?", hint: tierHint(schema.tier) },
    { label: "테이블", value: `${schema.tables.length.toLocaleString("ko-KR")}개` },
    {
      label: "SQL 파일",
      value: schema.sqlFileCount != null ? `${schema.sqlFileCount.toLocaleString("ko-KR")}개` : "?",
    },
  ];
  if (infos.length > 0) {
    rows.push({
      label: "참고",
      value: `${infos.length.toLocaleString("ko-KR")}건`,
      onClick: () => setInfoOpen(true),
    });
  }

  return (
    <>
      <InfoPopover
        rows={rows}
        title="스캔 정보"
        ariaLabel="스캔 정보 — 산출물·Tier·테이블 수·SQL 파일 수"
      />
      {infoOpen && (
        <UnresolvedModal
          title={`참고 ${infos.length.toLocaleString("ko-KR")}건`}
          sub="— 무해 신호(동일 정의 중복 등)"
          items={infos}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </>
  );
}
