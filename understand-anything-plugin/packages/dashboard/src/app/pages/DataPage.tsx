import { lazy, Suspense } from "react";

const DataMapView = lazy(() => import("../../components/data-map/DataMapView")); // ktds-fork (데이터 맵 개편)

/** 데이터 맵(db-schema · CRUD 매트릭스 · 코드 테이블) 섹션 — pmpl-proto pg-data. */
export default function DataPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <DataMapView />
      </Suspense>
    </div>
  );
}
