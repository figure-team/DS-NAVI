import { useCallback, useEffect, useState } from "react";
import { validateGraph } from "@understand-anything/core/schema";
import type { GraphIssue } from "@understand-anything/core/schema";
import { useDashboardStore } from "../store";
import TokenGate from "../components/TokenGate";
import ShellLayout from "./shell/ShellLayout";
import { DEMO_MODE, dataUrl, resolveInitialToken, storeToken } from "../shared/api/client";
import { ThemeProvider } from "../themes/index.ts";
import type { ThemeConfig } from "../themes/index.ts";
import { I18nProvider } from "../contexts/I18nContext.tsx";

/** Outlet context — 각 페이지가 useOutletContext로 받는다. */
export interface ShellContext {
  accessToken: string;
  loadError: string | null;
  graphIssues: GraphIssue[];
}

/**
 * 루트 레이아웃 (FRONT_REDESIGN §3·§4).
 * 토큰 가드 → 데이터 로딩 → 프로바이더 → 셸(NavRail+TopBar+Outlet).
 * 토큰 가드는 라우트가 아니라 이 레이아웃의 가드 — 딥링크 URL이 게이트를 통과해도 유지된다.
 */
export default function Root() {
  const [accessToken, setAccessToken] = useState<string | null>(resolveInitialToken);

  const handleTokenValid = useCallback((token: string) => {
    storeToken(token);
    setAccessToken(token);
  }, []);

  // In demo mode, skip token gate entirely
  if (DEMO_MODE) {
    return <RootData accessToken="__demo__" />;
  }

  if (accessToken === null) {
    return <TokenGate onTokenValid={handleTokenValid} />;
  }

  return <RootData accessToken={accessToken} />;
}

/** 구 App.tsx Dashboard() — 데이터 파일 로딩을 담당(내용 이관, 로직 동일). */
function RootData({ accessToken }: { accessToken: string }) {
  const setGraph = useDashboardStore((s) => s.setGraph);
  const setDomainGraph = useDashboardStore((s) => s.setDomainGraph);
  const setWikiGraph = useDashboardStore((s) => s.setWikiGraph); // ktds-fork (ADR-004)
  const setOverlayData = useDashboardStore((s) => s.setOverlayData);
  const setNodeOverrides = useDashboardStore((s) => s.setNodeOverrides); // P3
  const setApproverHandle = useDashboardStore((s) => s.setApproverHandle); // P3
  const setAccessToken = useDashboardStore((s) => s.setAccessToken); // P3
  const [loadError, setLoadError] = useState<string | null>(null);
  const [graphIssues, setGraphIssues] = useState<GraphIssue[]>([]);
  const [metaTheme, setMetaTheme] = useState<ThemeConfig | null>(null);
  const [outputLanguage, setOutputLanguage] = useState<string | undefined>();

  useEffect(() => {
    fetch(dataUrl("meta.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        if (meta?.theme) setMetaTheme(meta.theme);
      })
      .catch(() => {});
    fetch(dataUrl("config.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        if (config?.outputLanguage) setOutputLanguage(config.outputLanguage);
        // P3: approver 핸들(config.approver) — 저장 시 기본값. 없으면 대시보드 1회 입력.
        if (typeof config?.approver === "string" && config.approver.trim()) {
          setApproverHandle(config.approver.trim());
        }
      })
      .catch(() => {});
  }, []);

  // P3: 노드 오버레이(사용자 편집/확정) read-time 병합 소스 + 쓰기 토큰을 store 로.
  useEffect(() => {
    setAccessToken(accessToken);
    fetch(dataUrl("node-overrides.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setNodeOverrides(data);
        }
      })
      .catch(() => {});
  }, [setNodeOverrides, setAccessToken]);

  useEffect(() => {
    fetch(dataUrl("knowledge-graph.json", accessToken))
      .then((res) => {
        // res.ok 미검사 시 403/404의 {error} 본문이 그래프로 검증돼 "Missing project
        // metadata" 로 오인된다. dev server 재시작으로 토큰이 회전하면 흔히 발생 →
        // 정직한 메시지로 분기(특히 401/403 = 토큰 만료).
        if (!res.ok) {
          throw new Error(
            res.status === 401 || res.status === 403
              ? `access token rejected (HTTP ${res.status}) — reopen the dashboard with the current ?token= URL printed by the dev server`
              : `HTTP ${res.status}`,
          );
        }
        return res.json();
      })
      .then((data: unknown) => {
        const result = validateGraph(data);
        if (result.success && result.data) {
          setGraph(result.data);
          setGraphIssues(result.issues);
          if ((data as Record<string, unknown>).kind === "knowledge") {
            // P2: /knowledge로의 이동은 StructurePage의 isKnowledgeGraph 리다이렉트가 담당.
            useDashboardStore.getState().setIsKnowledgeGraph(true);
          }
          for (const issue of result.issues) {
            if (issue.level === "auto-corrected") {
              console.warn(`[graph] auto-corrected: ${issue.message}`);
            } else if (issue.level === "dropped") {
              console.error(`[graph] dropped: ${issue.message}`);
            }
          }
        } else if (result.fatal) {
          console.error("Knowledge graph validation failed:", result.fatal);
          setLoadError(`Invalid knowledge graph: ${result.fatal}`);
        } else {
          console.error("Knowledge graph validation failed: unknown error");
          setLoadError("Invalid knowledge graph: unknown validation error");
        }
      })
      .catch((err) => {
        console.error("Failed to load knowledge graph:", err);
        setLoadError(`Failed to load knowledge graph: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, [setGraph]);

  // ktds: 오버레이 2채널 로드 — diff(실측: review/understand-diff)와
  // impact(예측: understand-impact). 자동 활성은 store가 generatedAt 최신으로 결정.
  useEffect(() => {
    const loadOverlay = (fileName: string, source: "diff" | "impact") =>
      fetch(dataUrl(fileName, accessToken))
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data: unknown) => {
          if (
            data &&
            typeof data === "object" &&
            "changedNodeIds" in data &&
            "affectedNodeIds" in data &&
            Array.isArray((data as Record<string, unknown>).changedNodeIds) &&
            Array.isArray((data as Record<string, unknown>).affectedNodeIds)
          ) {
            const d = data as {
              changedNodeIds: string[];
              affectedNodeIds: string[];
              generatedAt?: unknown;
            };
            setOverlayData(source, {
              changed: d.changedNodeIds,
              affected: d.affectedNodeIds,
              generatedAt: typeof d.generatedAt === "string" ? d.generatedAt : "",
            });
          }
        })
        .catch(() => {});
    loadOverlay("diff-overlay.json", "diff");
    loadOverlay("impact-overlay.json", "impact");
  }, [setOverlayData]);

  // ktds(메뉴 개편 2차): 위험 오버레이 — risk-report.json(파일 단위 등급)을 그래프 노드에
  // 조인(상→changed/중→affected). 분석 이벤트가 아니라 상시 지표라 자동 활성 없음(토글 전용).
  const graph = useDashboardStore((s) => s.graph);
  useEffect(() => {
    if (!graph) return;
    fetch(dataUrl("risk-report.json", accessToken))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        const items = (data as { items?: Array<{ filePath?: unknown; grade?: unknown }> } | null)
          ?.items;
        if (!Array.isArray(items)) return;
        const byPath = new Map<string, string>();
        for (const it of items) {
          if (typeof it.filePath === "string" && typeof it.grade === "string") {
            byPath.set(it.filePath, it.grade);
          }
        }
        if (byPath.size === 0) return;
        const high: string[] = [];
        const mid: string[] = [];
        for (const node of graph.nodes) {
          if (typeof node.filePath !== "string") continue;
          const grade = byPath.get(node.filePath);
          if (grade === "상") high.push(node.id);
          else if (grade === "중") mid.push(node.id);
        }
        if (high.length + mid.length === 0) return;
        setOverlayData("risk", { changed: high, affected: mid, generatedAt: "" });
      })
      .catch(() => {});
  }, [graph, setOverlayData]);

  useEffect(() => {
    fetch(dataUrl("domain-graph.json", accessToken))
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data: unknown) => {
        if (!data) return;
        const result = validateGraph(data);
        if (result.success && result.data) {
          setDomainGraph(result.data);
        } else if (result.fatal) {
          console.warn(`[domain-graph] validation failed: ${result.fatal}`);
        }
      })
      .catch(() => {});
  }, [setDomainGraph]);

  // ktds-fork (ADR-004): 세분화 위키 그래프 로드 → "문서" 토글 소스. 없으면 토글 미표시.
  useEffect(() => {
    fetch(dataUrl("wiki-graph.json", accessToken))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!data) return;
        const result = validateGraph(data);
        if (result.success && result.data) {
          setWikiGraph(result.data);
        } else if (result.fatal) {
          console.warn(`[wiki-graph] validation failed: ${result.fatal}`);
        }
      })
      .catch(() => {});
  }, [setWikiGraph]);

  return (
    <I18nProvider language={outputLanguage ?? "ko"}>
      <ThemeProvider metaTheme={metaTheme}>
        <ShellLayout
          accessToken={accessToken}
          loadError={loadError}
          graphIssues={graphIssues}
        />
      </ThemeProvider>
    </I18nProvider>
  );
}

