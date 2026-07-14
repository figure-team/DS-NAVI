import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
// React Flow base styles — previously piggy-backed into the main bundle via
// GraphView.tsx's side-effect import (statically registered in routes.tsx).
// STRUCTURE_FROM_MAP_DESIGN v2 retired that file; every other @xyflow/react
// consumer (BusinessFlowView, FlowSpineView, StructureDomainGraphUA, ErdTab) is
// lazy-loaded, so nothing else guarantees this ships in the initial bundle.
// Import it once here so it's never route-dependent again.
import "@xyflow/react/dist/style.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
