import type { JavaFileFacts, JavaClassFacts, JavaLocalVar, ReceiverDesc } from "./java-facts.js";
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
  | "chain" // receiver is a method/field chain resolved via return/field type
  | "static" // receiver is a project type name: Type.m()
  | "super" // super.m()
  | "external" // receiver resolves to a JDK/library type (out of scope)
  | "unresolved"; // chained / inferred-var / unresolvable receiver

export interface ResolvedCall {
  callerRelPath: string;
  callerClass: string;
  callerMethod: string;
  /** Param count of the CALLER method — its overload key (with callerMethod). */
  callerArity: number;
  calleeMethod: string;
  /** Argument count of this call — selects the callee overload (with calleeMethod). */
  calleeArity: number;
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
interface ReceiverType extends TypeTarget {
  /** How the (top-level) receiver resolved — becomes the call's resolution. */
  kind: CallResolution;
}

interface ResolveCtx {
  relPath: string;
  facts: JavaFileFacts;
  cls: JavaClassFacts;
  params: Map<string, string>;
  locals: readonly JavaLocalVar[];
  /** Byte offset of the call — locals must be declared before it. */
  callStartIndex: number;
}

/** A member's declared type plus the file that declares it (for import context). */
interface MemberType {
  type: string;
  ownerRelPath: string;
}

const MAX_SUPER_DEPTH = 8;

export function buildMethodCallGraph(
  javaFacts: Map<string, JavaFileFacts>,
  classIndex: ClassIndex,
): MethodCallGraph {
  const primaryClassNames = buildPrimaryClassNames(javaFacts);
  const calls: ResolvedCall[] = [];

  /** The primary (top-level) class of a file, for superclass walks. */
  const primaryClassOf = (relPath: string): JavaClassFacts | null => {
    const fs = javaFacts.get(relPath);
    if (!fs) return null;
    return fs.classes.find((c) => c.qualifiedName === c.name) ?? fs.classes[0] ?? null;
  };

  /** Declared return type of `methodName` on the type in `relPath`, walking supers. */
  const returnTypeOf = (relPath: string, methodName: string, depth = 0): MemberType | null => {
    if (depth > MAX_SUPER_DEPTH) return null;
    const fs = javaFacts.get(relPath);
    if (!fs) return null;
    for (const cls of fs.classes) {
      const m = cls.methods.find((mm) => mm.name === methodName && mm.returnType);
      if (m?.returnType) return { type: m.returnType, ownerRelPath: relPath };
    }
    const primary = primaryClassOf(relPath);
    if (primary?.superclass) {
      const sup = resolveType(primary.superclass, fs, classIndex);
      if (sup.relPath) return returnTypeOf(sup.relPath, methodName, depth + 1);
    }
    return null;
  };

  /** Declared type of field `fieldName` on the type in `relPath`, walking supers. */
  const fieldTypeOf = (relPath: string, fieldName: string, depth = 0): MemberType | null => {
    if (depth > MAX_SUPER_DEPTH) return null;
    const fs = javaFacts.get(relPath);
    if (!fs) return null;
    for (const cls of fs.classes) {
      const f = cls.fields.find((ff) => ff.name === fieldName);
      if (f) return { type: f.typeName, ownerRelPath: relPath };
    }
    const primary = primaryClassOf(relPath);
    if (primary?.superclass) {
      const sup = resolveType(primary.superclass, fs, classIndex);
      if (sup.relPath) return fieldTypeOf(sup.relPath, fieldName, depth + 1);
    }
    return null;
  };

  const unresolvedType = (external = false): ReceiverType => ({
    relPath: null,
    external,
    kind: "unresolved",
  });

  /** Resolve a member type, using the declaring file's imports for context. */
  const memberToType = (m: MemberType, kind: CallResolution): ReceiverType => {
    const ownerFacts = javaFacts.get(m.ownerRelPath);
    if (!ownerFacts) return unresolvedType();
    const t = resolveType(m.type, ownerFacts, classIndex);
    return { relPath: t.relPath, external: t.external, kind };
  };

  /**
   * Infer the runtime type of a receiver expression. Recursive: a chained
   * `getCart().getItems()` resolves `getCart`'s return type, then looks up
   * `getItems` on it. null/`this` → the caller's own class; everything it can't
   * follow (lambda params, casts, `var`) → unresolved (never guessed).
   */
  const typeOfReceiver = (desc: ReceiverDesc | null, ctx: ResolveCtx): ReceiverType => {
    if (desc === null || desc.kind === "this") {
      return { relPath: ctx.relPath, external: false, kind: "self" };
    }
    if (desc.kind === "super") {
      if (!ctx.cls.superclass) return unresolvedType();
      const t = resolveType(ctx.cls.superclass, ctx.facts, classIndex);
      return { relPath: t.relPath, external: t.external, kind: "super" };
    }
    if (desc.kind === "name") {
      const name = desc.text;
      const localDecl = nearestLocal(ctx.locals, name, ctx.callStartIndex);
      if (localDecl !== null) {
        if (localDecl.typeName === "var") return unresolvedType();
        const t = resolveType(localDecl.typeName, ctx.facts, classIndex);
        return { relPath: t.relPath, external: t.external, kind: "local" };
      }
      const paramType = ctx.params.get(name);
      if (paramType !== undefined) {
        const t = resolveType(paramType, ctx.facts, classIndex);
        return { relPath: t.relPath, external: t.external, kind: "param" };
      }
      // Instance field, including those inherited from a superclass (e.g. the
      // Stripes `context` field on a base ActionBean) — resolved via the
      // declaring class's imports.
      const fieldMember = fieldTypeOf(ctx.relPath, name);
      if (fieldMember !== null) {
        return memberToType(fieldMember, "field");
      }
      // Capitalized name that resolves to a project type → static `Type.m()`.
      if (/^[A-Z]/.test(name)) {
        const t = resolveType(name, ctx.facts, classIndex);
        if (t.relPath !== null || t.external) {
          return { relPath: t.relPath, external: t.external, kind: "static" };
        }
      }
      return unresolvedType();
    }
    if (desc.kind === "call") {
      const owner = typeOfReceiver(desc.on, ctx); // on=null → self
      if (owner.relPath === null) return unresolvedType(owner.external);
      const rt = returnTypeOf(owner.relPath, desc.methodName);
      if (rt === null) return unresolvedType();
      return memberToType(rt, "chain");
    }
    if (desc.kind === "field") {
      const owner = typeOfReceiver(desc.on, ctx);
      if (owner.relPath === null) return unresolvedType(owner.external);
      const ft = fieldTypeOf(owner.relPath, desc.field);
      if (ft === null) return unresolvedType();
      // `this.field` / bare-field stays "field"; deeper `a.b.c` is a chain hop.
      const kind: CallResolution = desc.on === null || desc.on.kind === "this" ? "field" : "chain";
      return memberToType(ft, kind);
    }
    return unresolvedType();
  };

  for (const relPath of [...javaFacts.keys()].sort()) {
    const facts = javaFacts.get(relPath)!;
    for (const cls of facts.classes) {
      for (const method of cls.methods) {
        const params = parseParams(method.paramsText);
        for (const call of method.calls) {
          const base = {
            callerRelPath: relPath,
            callerClass: cls.name,
            callerMethod: method.name,
            callerArity: method.paramCount,
            calleeMethod: call.methodName,
            calleeArity: call.argCount,
            receiverText: call.receiverText,
            line: call.line,
          };
          const ctx: ResolveCtx = {
            relPath,
            facts,
            cls,
            params,
            locals: method.locals,
            callStartIndex: call.startIndex,
          };
          const target = typeOfReceiver(call.receiver, ctx);

          if (target.external) {
            calls.push({ ...base, calleeRelPath: null, calleeClass: null, resolution: "external" });
          } else if (target.relPath === null) {
            calls.push({ ...base, calleeRelPath: null, calleeClass: null, resolution: "unresolved" });
          } else {
            calls.push({
              ...base,
              calleeRelPath: target.relPath,
              // `self` keeps the caller's own (possibly nested) class name.
              calleeClass:
                target.kind === "self" ? cls.name : primaryClassNames.get(target.relPath) ?? null,
              resolution: target.kind,
            });
          }
        }
      }
    }
  }

  return { calls };
}

/**
 * Per-flow method-call labels: `callerFile → (calleeFile → ordered methods)`.
 * Nested maps (not string-concatenated keys) so lookups are unambiguous for any
 * relPath/method.
 */
export type FlowCallLabels = Map<string, Map<string, string[]>>;

/**
 * Trace one flow's real method-call sequence: start at its handler method and
 * follow resolved calls transitively, restricted to the flow's step files.
 * Returns, per caller->callee file pair, the ordered unique method names actually
 * invoked — what the dashboard labels each `calls` edge with so a file->file edge
 * reads e.g. "updateAccount -> getAccount" and two calls to the same collaborator
 * are no longer invisible.
 *
 * Flow-specific (rooted at the handler), NOT a project-wide file aggregate — so
 * `editAccount`'s edge shows only editAccount's calls, not `newAccount`'s. Self
 * calls (`this.helper()`) draw no edge but are still followed, so intra-class
 * delegation surfaces the deeper service/dao calls it leads to.
 */
export function traceFlowMethodCalls(
  graph: MethodCallGraph,
  rootRelPath: string,
  handlerMethod: string | undefined,
  stepFiles: ReadonlySet<string>,
): FlowCallLabels {
  const out: FlowCallLabels = new Map();
  if (handlerMethod === undefined) return out;

  // callerFile -> methodName -> paramCount(arity) -> its resolved calls.
  // Keyed by arity so overloads stay distinct (getAccount(u) vs getAccount(u,p)).
  const byMethod = new Map<string, Map<string, Map<number, ResolvedCall[]>>>();
  for (const c of graph.calls) {
    let byName = byMethod.get(c.callerRelPath);
    if (!byName) byMethod.set(c.callerRelPath, (byName = new Map()));
    let byArity = byName.get(c.callerMethod);
    if (!byArity) byName.set(c.callerMethod, (byArity = new Map()));
    const list = byArity.get(c.callerArity);
    if (list) list.push(c);
    else byArity.set(c.callerArity, [c]);
  }

  // Pick the calls of the overload matching `arity`. arity null (the entry
  // handler — never overloaded) takes every overload. When a concrete arity has
  // no exact overload, fall back to the sole overload if unambiguous, else to
  // all (no loss — just the pre-overload behavior for that odd case).
  const resolveCalls = (byArity: Map<number, ResolvedCall[]>, arity: number | null): ResolvedCall[] => {
    if (arity === null) return [...byArity.values()].flat();
    const exact = byArity.get(arity);
    if (exact) return exact;
    if (byArity.size === 1) return [...byArity.values()][0];
    return [...byArity.values()].flat();
  };

  const visited = new Set<string>();
  const visit = (file: string, method: string, arity: number | null): void => {
    const vkey = `${file}\n${method}\n${arity ?? -1}`;
    if (visited.has(vkey)) return;
    visited.add(vkey);
    const byArity = byMethod.get(file)?.get(method);
    if (!byArity) return;
    for (const call of resolveCalls(byArity, arity)) {
      const callee = call.calleeRelPath;
      if (callee === null || !stepFiles.has(callee)) continue;
      if (callee !== file) {
        let byCallee = out.get(file);
        if (!byCallee) out.set(file, (byCallee = new Map()));
        const methods = byCallee.get(callee);
        if (methods) {
          if (!methods.includes(call.calleeMethod)) methods.push(call.calleeMethod);
        } else {
          byCallee.set(callee, [call.calleeMethod]);
        }
      }
      visit(callee, call.calleeMethod, call.calleeArity);
    }
  };
  visit(rootRelPath, handlerMethod, null);
  return out;
}
