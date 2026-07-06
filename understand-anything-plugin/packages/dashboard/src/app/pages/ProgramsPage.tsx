import { lazy, Suspense } from "react";

const ProgramsView = lazy(() => import("../../components/ProgramsView")); // ktds-fork (메뉴 개편 2차)

/** 프로그램 목록(program-inventory · FP · 인터페이스 · 배치) 섹션 — pmpl-proto pg-programs. */
export default function ProgramsPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <ProgramsView />
      </Suspense>
    </div>
  );
}
