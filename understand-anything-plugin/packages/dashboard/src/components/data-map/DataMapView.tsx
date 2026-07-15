import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { useDashboardStore } from "../../store";
import { PageHead, ProtoTabs } from "../proto/Proto";
import CrudTab from "./CrudTab";
import TablesTab from "./TablesTab";
import UnresolvedChips from "./UnresolvedChips";
import type { CrudMatrix, DbSchema } from "./types";

// ERD 탭은 @xyflow/react + elkjs 를 끌고 오므로 진입 시점 분리 로드.
const ErdTab = lazy(() => import("./ErdTab"));

/**
 * 데이터 맵(pg-data) 컨테이너 — db-schema.json / crud-matrix.json 로드 + 탭 라우팅.
 * 개편(docs/ktds/DATA_MAP_REDESIGN_DESIGN.md): 탭·선택·검색·필터를 전부 URL 로 이관
 * (?tab=&table=&q=&crudq=&crudTable=&pivot=) — 딥링크·새로고침·뒤로가기 동작.
 * 데이터 부재 시 화면/탭 단위 정직한 안내 카드(침묵 누락 금지).
 */

// 코드 테이블 탭은 2026-07-10 제거(구 ?tab=code 딥링크는 tables 폴백) — 검색·코드성
// 그룹·배지·판정 사유·행 샘플이 전부 테이블 탭에 흡수돼 고유 가치가 소멸(설계문서 §7 결정 뒤집음).
type TabKey = "tables" | "erd" | "crud";
const TAB_KEYS: TabKey[] = ["tables", "erd", "crud"];

/** 정직한 부재/오류 안내 카드. */
function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] border border-border-subtle bg-panel card-shadow text-text-muted"
      style={{ padding: "28px 26px", fontSize: 13, lineHeight: 1.7 }}
    >
      {children}
    </div>
  );
}

export default function DataMapView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [schemaErr, setSchemaErr] = useState<string | null>(null);
  const [crud, setCrud] = useState<CrudMatrix | null>(null);
  const [crudErr, setCrudErr] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabKey = TAB_KEYS.includes(tabParam as TabKey) ? (tabParam as TabKey) : "tables";

  useEffect(() => {
    let alive = true;
    fetch(`${dataBase}db-schema.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: DbSchema) => {
        if (!alive) return;
        if (Array.isArray(data?.tables)) setSchema(data);
        else setSchemaErr("db-schema.json 형식 오류");
      })
      .catch((e) => alive && setSchemaErr(String(e instanceof Error ? e.message : e)));

    fetch(`${dataBase}crud-matrix.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: CrudMatrix) => {
        if (!alive) return;
        if (Array.isArray(data?.columns) && Array.isArray(data?.rows)) setCrud(data);
        else setCrudErr("crud-matrix.json 형식 오류");
      })
      .catch((e) => alive && setCrudErr(String(e instanceof Error ? e.message : e)));

    return () => {
      alive = false;
    };
  }, [dataBase, tokenQ]);

  // db-schema 자체가 없으면 화면 전체를 안내(테이블·ERD 탭이 모두 이것에 의존).
  const schemaMissing = !schema && schemaErr != null;

  // unresolved 는 meta 줄에 칩으로 얹는다 — 이 줄이 서술하는 대상이 곧 db-schema.json 이라
  // 신호의 출처가 붙고, 배너로 쓰던 수직 공간(46px)이 회수된다. PageHead.meta 는 ReactNode.
  const meta = schema ? (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span>
        {`db-schema.json · Tier ${schema.tier?.toUpperCase() ?? "?"} · 테이블 ${schema.tables.length} · SQL ${schema.sqlFileCount ?? "?"}파일`}
      </span>
      <UnresolvedChips unresolved={schema.unresolved ?? []} />
    </span>
  ) : undefined;

  // 배지는 전 탭 상시 표시 — ERD 는 테이블 탭과 같은 대상(테이블 수)을 센다
  // (FK 관계 수를 넣었더니 "테이블 190 vs ERD 62"로 오독됨). 데이터 부재는 0.
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "tables", label: "테이블", count: schema?.tables.length ?? 0 },
    { key: "erd", label: "ERD", count: schema?.tables.length ?? 0 },
    { key: "crud", label: "CRUD 매트릭스", count: crud?.rows.length ?? 0 },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="데이터 맵"
        meta={meta}
        actions={
          <>
            <Link
              to="/deliverables/si-테이블정의서"
              className="rounded-lg border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold"
              style={{ padding: "7px 14px", fontSize: 13, textDecoration: "none", display: "inline-block" }}
            >
              테이블 정의서 md
            </Link>
            <button
              type="button"
              disabled
              title="후속 예정"
              className="rounded-lg border border-border-medium bg-panel text-text-secondary font-semibold disabled:opacity-50 disabled:cursor-default"
              style={{ padding: "7px 14px", fontSize: 13 }}
            >
              xlsx
            </button>
          </>
        }
      />

      {schemaMissing ? (
        <EmptyCard>
          <b className="text-text-primary">db-schema.json 없음</b>
          <br />
          데이터 맵은 정적 분석 산출물 <code>db-schema.json</code> 에 의존합니다. understand-map 스캔을 먼저 실행하면
          테이블·컬럼·PK/FK·코드성 행 데이터가 생성됩니다.
          <br />
          <span style={{ fontSize: 12 }}>({schemaErr})</span>
        </EmptyCard>
      ) : (
        <>
          <ProtoTabs
            tabs={tabs}
            active={tab}
            onChange={(k) =>
              setSearchParams((prev) => {
                prev.set("tab", k);
                return prev;
              })
            }
          />

          {tab === "tables" && (schema ? <TablesTab schema={schema} /> : <EmptyCard>로딩 중…</EmptyCard>)}

          {tab === "erd" &&
            (schema ? (
              <Suspense fallback={<EmptyCard>ERD 로딩 중…</EmptyCard>}>
                <ErdTab schema={schema} />
              </Suspense>
            ) : (
              <EmptyCard>로딩 중…</EmptyCard>
            ))}

          {tab === "crud" &&
            (crud ? (
              <CrudTab crud={crud} />
            ) : (
              <EmptyCard>
                <b className="text-text-primary">crud-matrix.json 없음</b>
                <br />
                기능 흐름 × 테이블 CRUD 매트릭스는 understand-map 스캔에서 생성됩니다.
                {crudErr && (
                  <>
                    <br />
                    <span style={{ fontSize: 12 }}>({crudErr})</span>
                  </>
                )}
              </EmptyCard>
            ))}
        </>
      )}
    </div>
  );
}
