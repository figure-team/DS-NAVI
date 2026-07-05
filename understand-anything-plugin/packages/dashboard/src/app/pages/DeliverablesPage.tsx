import { lazy, Suspense } from "react";

const DocsView = lazy(() => import("../../components/DocsView")); // ktds-fork (D3)

/** 산출물 문서(편집·확정) 섹션 — 자체 툴바를 가진 풀페이지. */
export default function DeliverablesPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <DocsView />
      </Suspense>
    </div>
  );
}
