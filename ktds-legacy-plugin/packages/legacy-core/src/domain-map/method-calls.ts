import type { JavaFileFacts, JavaLocalVar } from "./java-facts.js";
import { resolveTypeRef } from "./edges.js";
import type { ClassIndex } from "./edges.js";

/**
 * Method-level call graph (net-new).
 *
 * The file-level edge layer (edges.ts) carries only STRUCTURAL adjacency —
 * import / injection / field-type / extends / implements / mybatis. It has no
 * notion of which method calls which, in what order. The domain-map flow spine
 * is therefore a *file* dependency projection, not an execution trace: two calls
 * to the same collaborator class collapse to one step and the source statement
 * order is lost.
 *
 * This module reconstructs the missing layer: for every method it resolves each
 * invocation's receiver to a target file/class and keeps the calls in source
 * order. Receiver → type resolution reuses {@link resolveTypeRef} (javac-style:
 * explicit import > same package > wildcard > unique project candidate), so this
 * stays consistent with the file-edge resolver and invents nothing.
 *
 * Scope (foundation): resolves receivers that are instance fields, method
 * parameters, `this`, `super`, unqualified self-calls, and static `Type.m()`
 * references. Local variables and chained receivers (`getX().getY()`) are
 * reported as `unresolved` rather than guessed — honesty over coverage. No
 * graph/dashboard wiring yet; this is a standalone, separately-tested capability.
 */

export type CallResolution =
  | "field" // receiver is an instance field of the caller class
  | "self" // unqualified call or this.m() → the caller's own class
  | "param" // receiver is a parameter of the caller method
  | "local" // receiver is a local / loop variable declared in the method body
  | "static" // receiver is a project type name: Type.m()
  | "super" // super.m()
  | "external" // receiver resolves to a JDK/library type (out of scope)
  | "unresolved"; // chained / inferred-var / unresolvable receiver

export interface ResolvedCall {
  callerRelPath: string;
  callerClass: string;
  callerMethod: string;
  calleeMethod: string;
  /** Target file, or null when external/unresolved. */
  calleeRelPath: string | null;
  /** Target class simple name, or null when external/unresolved. */
  calleeClass: string | null;
  /** Receiver source text as written; null for an unqualified self-call. */
  receiverText: string | null;
  line: number;
  resolution: CallResolution;
}

export interface MethodCallGraph {
  /** Every invocation across the project, deterministic order (file→class→method→source). */
  calls: ResolvedCall[];
}

const SIMPLE_ID_RE = /^[A-Za-z_$][\w$]*$/;

function stripGenerics(typeText: string): string {
  const open = typeText.indexOf("<");
  const base = open === -1 ? typeText : typeText.slice(0, open);
  return base.replace(/\[\]/g, "").replace(/\.\.\.$/, "").trim();
}

/** Split a parameter list on top-level commas (ignoring commas inside <> or ()). */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "<" || ch === "(") depth++;
    else if (ch === ">" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (start < inner.length) parts.push(inner.slice(start));
  return parts;
}

/**
 * Parse `paramsText` ("(Account account, final String name)") into name → type.
 * Heuristic but sufficient for receiver resolution: the parameter name is the
 * last identifier, its type the token before it (generics/varargs stripped).
 * Leading annotations/modifiers are dropped.
 */
function parseParams(paramsText: string): Map<string, string> {
  const out = new Map<string, string>();
  const inner = paramsText.trim().replace(/^\(/, "").replace(/\)$/, "").trim();
  if (!inner) return out;
  for (const raw of splitTopLevel(inner)) {
    // Drop parameter annotations (@Validate(...), @Param("x")) and modifiers.
    const seg = raw.replace(/@\w+(\([^)]*\))?/g, "").replace(/\bfinal\b/g, "").trim();
    const tokens = seg.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const name = tokens[tokens.length - 1].replace(/\[\]/g, "");
    const type = stripGenerics(tokens[tokens.length - 2]);
    if (SIMPLE_ID_RE.test(name) && type) out.set(name, type);
  }
  return out;
}

/**
 * Nearest preceding declaration of `name` before byte offset `before`, or null.
 * Position match approximates lexical scope: a use binds to the most recent
 * earlier declaration of that name (handles redeclaration/loop shadowing).
 */
function nearestLocal(
  locals: readonly JavaLocalVar[],
  name: string,
  before: number,
): JavaLocalVar | null {
  let best: JavaLocalVar | null = null;
  for (const d of locals) {
    if (d.name !== name || d.startIndex >= before) continue;
    if (best === null || d.startIndex > best.startIndex) best = d;
  }
  return best;
}

/** relPath → its primary (first top-level) class simple name. */
function buildPrimaryClassNames(javaFacts: Map<string, JavaFileFacts>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [relPath, facts] of javaFacts) {
    const top = facts.classes.find((c) => c.qualifiedName === c.name) ?? facts.classes[0];
    if (top) out.set(relPath, top.name);
  }
  return out;
}

interface TypeTarget {
  relPath: string | null;
  external: boolean;
}

/** Resolve a written type name to a project file (or mark external). */
function resolveType(typeName: string, facts: JavaFileFacts, index: ClassIndex): TypeTarget {
  const res = resolveTypeRef(typeName, facts, index);
  if (res.kind === "resolved") return { relPath: res.relPath, external: false };
  if (res.kind === "external") return { relPath: null, external: true };
  return { relPath: null, external: false }; // ambiguous / not-found → unresolved
}

/**
 * Build the project-wide method-level call graph. Pure: no I/O, no re-parsing —
 * consumes the single-parse `javaFacts` (which now carry ordered `calls`) and
 * the cross-file {@link ClassIndex}.
 */
export function buildMethodCallGraph(
  javaFacts: Map<string, JavaFileFacts>,
  classIndex: ClassIndex,
): MethodCallGraph {
  const primaryClassNames = buildPrimaryClassNames(javaFacts);
  const calls: ResolvedCall[] = [];

  const finalize = (
    base: Omit<ResolvedCall, "calleeRelPath" | "calleeClass" | "resolution">,
    target: TypeTarget,
    resolution: CallResolution,
  ): ResolvedCall => {
    if (target.external) {
      return { ...base, calleeRelPath: null, calleeClass: null, resolution: "external" };
    }
    if (target.relPath === null) {
      return { ...base, calleeRelPath: null, calleeClass: null, resolution: "unresolved" };
    }
    return {
      ...base,
      calleeRelPath: target.relPath,
      calleeClass: primaryClassNames.get(target.relPath) ?? null,
      resolution,
    };
  };

  for (const relPath of [...javaFacts.keys()].sort()) {
    const facts = javaFacts.get(relPath)!;
    for (const cls of facts.classes) {
      const fieldTypes = new Map(cls.fields.map((f) => [f.name, f.typeName] as const));
      for (const method of cls.methods) {
        const paramTypes = parseParams(method.paramsText);
        for (const call of method.calls) {
          const base = {
            callerRelPath: relPath,
            callerClass: cls.name,
            callerMethod: method.name,
            calleeMethod: call.methodName,
            receiverText: call.receiverText,
            line: call.line,
          };

          const R = call.receiverText;

          // Unqualified call or `this.m()` → the caller's own class.
          if (R === null || R === "this") {
            calls.push({
              ...base,
              calleeRelPath: relPath,
              calleeClass: cls.name,
              resolution: "self",
            });
            continue;
          }

          // `super.m()` → the (resolved) superclass file.
          if (R === "super") {
            const target = cls.superclass
              ? resolveType(cls.superclass, facts, classIndex)
              : { relPath: null, external: false };
            calls.push(finalize(base, target, "super"));
            continue;
          }

          // Reduce `this.field` → `field`; reject anything not a bare identifier
          // (chained `getX().y`, qualified `a.b.c`) as unresolved — those need
          // return-type/dataflow inference, out of foundation scope.
          let root = R;
          let thisQualified = false;
          if (root.startsWith("this.")) {
            root = root.slice(5);
            thisQualified = true;
          }
          if (!SIMPLE_ID_RE.test(root)) {
            calls.push({ ...base, calleeRelPath: null, calleeClass: null, resolution: "unresolved" });
            continue;
          }

          // Method-scoped names (locals, params) shadow instance fields — but an
          // explicit `this.x` receiver always means the field, so skip them then.
          if (!thisQualified) {
            const localDecl = nearestLocal(method.locals, root, call.startIndex);
            if (localDecl !== null) {
              // `var x = …` can't be resolved without type inference — honest
              // unresolved rather than mis-binding to a same-named field.
              if (localDecl.typeName === "var") {
                calls.push({ ...base, calleeRelPath: null, calleeClass: null, resolution: "unresolved" });
              } else {
                calls.push(finalize(base, resolveType(localDecl.typeName, facts, classIndex), "local"));
              }
              continue;
            }
            const paramType = paramTypes.get(root);
            if (paramType !== undefined) {
              calls.push(finalize(base, resolveType(paramType, facts, classIndex), "param"));
              continue;
            }
          }

          const fieldType = fieldTypes.get(root);
          if (fieldType !== undefined) {
            calls.push(finalize(base, resolveType(fieldType, facts, classIndex), "field"));
            continue;
          }

          // Capitalized non-field/param identifier that names a project type →
          // a static call `Type.m()`. Lowercase roots are local variables we
          // don't track → unresolved.
          if (/^[A-Z]/.test(root)) {
            const target = resolveType(root, facts, classIndex);
            if (target.relPath !== null || target.external) {
              calls.push(finalize(base, target, "static"));
              continue;
            }
          }

          calls.push({ ...base, calleeRelPath: null, calleeClass: null, resolution: "unresolved" });
        }
      }
    }
  }

  return { calls };
}
