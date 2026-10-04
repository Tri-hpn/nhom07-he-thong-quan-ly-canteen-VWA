// TEMP: detect React hooks used without being imported (runtime ReferenceError class of bug)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const HOOKS = [
  "useState", "useEffect", "useMemo", "useCallback", "useRef", "useReducer",
  "useLayoutEffect", "useImperativeHandle", "useContext", "useDebugValue",
  "useId", "useTransition", "useDeferredValue", "useSyncExternalStore",
  "useInsertionEffect", "useOptimistic", "useActionState",
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

// crude comment stripper (good enough: files use // and /* */ only)
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

const files = walk(ROOT);
const problems = [];

for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  const code = stripComments(raw);
  const lines = code.split(/\r?\n/);

  // 1) react imports (line-anchored, may span to closing quote)
  const imported = new Set();
  const namespaces = [];
  const importRe = /^[ \t]*import\s+([\s\S]*?)\s+from\s+["']react["']/gm;
  let m;
  while ((m = importRe.exec(code))) {
    const clause = m[1];
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const id = part.trim().split(/\s+as\s+/).pop().trim();
        if (id) imported.add(id);
      }
    }
    const star = clause.match(/\*\s+as\s+(\w+)/);
    if (star) namespaces.push(star[1]);
    const def = clause.replace(/\{[\s\S]*?\}/, "").replace(/,/g, " ").trim();
    if (def && !def.startsWith("*")) namespaces.push(def);
  }

  // 2) hook usages
  const used = new Map(); // hook -> first line no
  lines.forEach((line, i) => {
    for (const h of HOOKS) {
      const re = new RegExp(`(^|[^\\w.$])${h}\\s*(?=[(.<])`);
      if (!used.has(h) && re.test(line)) used.set(h, i + 1);
      if (!namespaces.length) continue;
      const nsRe = new RegExp(`(^|[^\\w.$])(${namespaces.join("|")})\\.${h}\\b`);
      if (!used.has(h) && nsRe.test(line)) used.set(h, i + 1);
    }
  });

  // 3) report missing
  for (const [h, line] of used) {
    if (imported.has(h)) continue;
    if (new RegExp(`(function|const|let|var|class)\\s+${h}\\b`).test(code)) continue;
    problems.push({ file: path.relative(process.cwd(), f).replace(/\\/g, "/"), hook: h, line });
  }
}

console.log(`scanned ${files.length} files`);
if (!problems.length) console.log("OK: no missing hook imports");
for (const p of problems) console.log(`MISSING  ${p.hook.padEnd(18)} ${p.file}:${p.line}`);


function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const problems = [];

for (const f of files) {
  const code = fs.readFileSync(f, "utf8");
  const lines = code.split(/\r?\n/);

  // 1) collect imported identifiers from react (named + namespace)
  const imported = new Set();
  const nsImports = [];
  const importRe = /import\s+([\s\S]*?)\s+from\s+["']react["']/g;
  let m;
  while ((m = importRe.exec(code))) {
    const clause = m[1];
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const raw of named[1].split(",")) {
        const id = raw.trim().split(/\s+as\s+/).pop().trim();
        if (id) imported.add(id);
      }
    }
    const ns = clause.replace(/\{[\s\S]*?\}/, "").replace(/,/g, " ").trim();
    if (ns && !ns.startsWith("*")) nsImports.push(ns);
    const star = clause.match(/\*\s+as\s+(\w+)/);
    if (star) nsImports.push(star[1]);
  }

  // 2) find hook usages
  const used = new Map(); // hook -> first line
  lines.forEach((line, i) => {
    const stripped = line.replace(/\/\/.*$/, "");
    for (const h of HOOKS) {
      const re = new RegExp(`(^|[^\\w.$])${h}\\s*(?=[(<.])`, "g");
      if (re.test(stripped) && !used.has(h)) used.set(h, i + 1);
      // namespace usage e.g. React.useMemo
      const nsRe = new RegExp(`(^|[^\\w.])(${nsImports.join("|")})\\.${h}\\b`, "g");
      if (nsImports.length && nsRe.test(stripped) && !used.has(h)) used.set(h, i + 1);
    }
  });

  // 3) detect shadowing imports (local function/const named like a hook) -> ignore if defined locally
  for (const [h, line] of used) {
    if (imported.has(h)) continue;
    const locallyDefined = new RegExp(`(function|const|let|var|class)\\s+${h}\\b`).test(code);
    if (locallyDefined) continue;
    problems.push({ file: path.relative(process.cwd(), f), hook: h, line });
  }
}

console.log(`scanned ${files.length} files`);
if (!problems.length) console.log("OK: no missing hook imports");
for (const p of problems) console.log(`MISSING ${p.hook}  ${p.file}:${p.line}`);
