'use strict';

/**
 * build-index.js — يولّد INDEX.md في جذر المستودع من المستودع نفسه.
 *
 *   node scripts/build-index.js            يكتب INDEX.md ويطبع عدد أسطره
 *   node scripts/build-index.js --check    يقارن الموجود بالمولَّد: 0 عند التطابق، 1 عند الاختلاف
 *
 * لا اعتماديات: `fs` و`path` المدمجان فقط، فالسكربت يعمل بلا `node_modules`.
 * المخرج حتمي تماماً: بلا طابع زمني، بلا مسارات مطلقة، وبلا أي ترتيب يعتمد على نظام
 * الملفات (كل قائمة تُرتَّب صراحةً). لذلك تصلح `--check` بوابةَ تقادم في `npm test`.
 *
 * القياس المعتمد في «خريطة الوحدات» هو الأسطر غير الفارغة (سطر ليس '' حرفياً)، لأن
 * كل أرقام المستودع الموثَّقة محسوبة بهذا التعريف: `server/src` ملفات .js وحدها،
 * و`web` ملفات .js وحدها، و`mobile/lib` كل ملفاته.
 *
 * التحليل بالتعبيرات النمطية على المستوى اللفظي — لا محلّل AST ولا تنفيذ للكود.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_PATH = path.join(ROOT, 'INDEX.md');
const CODE_PATH = path.join(ROOT, 'INDEX-code.md');
const TESTS_PATH = path.join(ROOT, 'INDEX-tests.md');
const CHECK = process.argv.includes('--check');

const GUARD_NAMES = ['authenticate', 'optionalAuthenticate', 'requireAdmin', 'requireSuperAdmin'];

// ---------------------------------------------------------------------------
// قراءة الملفات والأسطر
// ---------------------------------------------------------------------------

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function listDir(rel) {
  return fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true });
}

/** ملفات .js في شجرة مجلد، مرتبة، بمسارات نسبية بفواصل مائلة. */
function walk(relDir, accept) {
  const out = [];
  const step = (dir) => {
    for (const entry of listDir(dir)) {
      const child = dir + '/' + entry.name;
      if (entry.isDirectory()) step(child);
      else if (accept(child)) out.push(child);
    }
  };
  step(relDir);
  return out.sort(compare);
}

/** الأسطر غير الفارغة — التعريف الذي تُقاس به أحجام الوحدات في هذا المستودع. */
function countLines(text) {
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let total = 0;
  for (const line of lines) if (line !== '' && line !== '\r') total += 1;
  return total;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniq(items) {
  return items.filter((item, index) => items.indexOf(item) === index);
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/** `ملف:سطر` عند أول تطابق، أو الملف وحده إن لم يوجد. */
function anchor(rel, pattern) {
  if (!exists(rel)) return '`' + rel + '`';
  const src = read(rel);
  const match = pattern.exec(src);
  if (!match) return '`' + rel + '`';
  return '`' + rel + ':' + lineOf(src, match.index) + '`';
}

// ---------------------------------------------------------------------------
// أدوات لفظية: وسائط الاستدعاء، النصوص، الفصل على المستوى الأعلى
// ---------------------------------------------------------------------------

/**
 * يقرأ وسائط استدعاء بدأت عند `open` (موضع القوس نفسه) ويُرجع نصوص الوسائط
 * مفصولة على مستوى العمق 0، مع تجاهل التعليقات وسلاسل النصوص.
 * يتعامل أيضاً مع حرفيات regex بسيطة حتى لا يُربَك عدّ الأقواس.
 */
function readArgs(src, open) {
  const args = [];
  let depth = 0;
  let quote = null;
  let start = open + 1;
  let i = open;

  for (; i < src.length; i += 1) {
    const ch = src[i];

    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? src.length : nl;
      continue;
    }

    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }

    if (ch === '/' && regexCanStart(src, i)) {
      i = skipRegex(src, i);
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) {
        args.push({ text: src.slice(start, i), start });
        return args;
      }
      continue;
    }

    if (ch === ',' && depth === 1) {
      args.push({ text: src.slice(start, i), start });
      start = i + 1;
    }
  }

  args.push({ text: src.slice(start, i), start });
  return args;
}

function regexCanStart(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return true;
  return '([{,;:=!&|?+-*%~<>'.indexOf(src[j]) !== -1;
}

function skipRegex(src, start) {
  let i = start + 1;
  let inClass = false;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') { i += 1; continue; }
    if (ch === '[') { inClass = true; continue; }
    if (ch === ']') { inClass = false; continue; }
    if (ch === '/' && !inClass) return i;
    if (ch === '\n') return i;
  }
  return i;
}

/** أول حرفية نصية في مقطع، مع فكّ أبسط للهروب. */
function firstLiteral(text) {
  let i = 0;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  const quote = text[i];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;

  let value = '';
  for (let j = i + 1; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === '\\') {
      const next = text[j + 1];
      value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
      j += 1;
      continue;
    }
    if (ch === quote) {
      return { value, quote, template: quote === '`' && value.indexOf('${') !== -1 };
    }
    value += ch;
  }
  return null;
}

/** يفصل جسم كائن/مصفوفة على الفواصل في العمق 0، ويُرجع النص وموضعه. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];

    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }

    if (ch === '/' && body[i + 1] === '/') {
      const nl = body.indexOf('\n', i);
      i = nl < 0 ? body.length : nl;
      continue;
    }

    if (ch === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2);
      i = end < 0 ? body.length : end + 1;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') { depth += 1; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; continue; }

    if (ch === ',' && depth === 0) {
      parts.push({ text: body.slice(start, i), start });
      start = i + 1;
    }
  }

  parts.push({ text: body.slice(start), start });
  return parts;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** يستبدل التعليقات بمسافات بنفس الطول: يمنع قراءة `router.use(` من تعليق ويحفظ الأسطر. */
function blankComments(src) {
  let out = '';
  let quote = null;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += src[i + 1] || '';
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }

    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      const end = nl < 0 ? src.length : nl;
      out += ' '.repeat(end - i);
      i = end - 1;
      continue;
    }

    if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close < 0 ? src.length : close + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end - 1;
      continue;
    }

    out += ch;
  }

  return out;
}

/** موضع أول سطر يحمل الاسم نفسه — لا تعليقاً يسبقه داخل جسم `module.exports`. */
function offsetOfKey(text, key) {
  const pattern = new RegExp('^' + key + '(\\s*[,:]|$)');
  let offset = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && trimmed.charAt(0) !== '/' && pattern.test(trimmed)) {
      return offset + (line.length - line.trimStart().length);
    }
    offset += line.length + 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// تركيب المسارات
// ---------------------------------------------------------------------------

/** جدول التركيب: ملف الراوتر → { base, prefix }، وشُبّاك المشاركة → جذرها. */
function resolveMounts() {
  const indexSrc = read('server/src/routes/index.js');
  const moduleVar = new Map();
  for (const match of indexSrc.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*require\('\.\/([^']+)'\)/g)) {
    const required = match[2].endsWith('.js') ? match[2] : match[2] + '.js';
    moduleVar.set(match[1], 'server/src/routes/' + required);
  }

  const appSrc = read('server/src/app.js');
  const apiMount = /app\.use\('([^']+)',\s*routes\)/.exec(appSrc);
  const apiBase = apiMount ? apiMount[1] : '/api';

  const byFile = new Map();
  for (const match of indexSrc.matchAll(/router\.use\(\s*(?:'([^']*)'\s*,\s*)?([A-Za-z_$][\w$]*)\s*\)/g)) {
    const rel = moduleVar.get(match[2]);
    if (rel) byFile.set(rel, { base: apiBase, prefix: match[1] || '' });
  }

  const shareRoots = new Map();
  for (const match of appSrc.matchAll(/app\.use\('([^']+)',\s*shareRoutes\.([A-Za-z_$][\w$]*)\)/g)) {
    shareRoots.set(match[2], { base: '', prefix: match[1] });
  }

  return function mountFor(rel, routerVar) {
    if (shareRoots.has(routerVar)) return shareRoots.get(routerVar);
    return byFile.get(rel) || { base: '', prefix: '' };
  };
}

function joinPath(base, prefix, inner) {
  let full = (base || '') + (prefix || '') + (inner || '');
  full = full.replace(/\/{2,}/g, '/');
  if (full.charAt(0) !== '/') full = '/' + full;
  if (full.length > 1 && full.charAt(full.length - 1) === '/') full = full.slice(0, -1);
  return full;
}

/**
 * حرّاس مستوى الراوتر: `router.use('<بادئة>', guard)` أو `router.use([...], guard)`.
 * تُطبَّق على كل مسار يقع تحت البادئة، لأن الراوتر يركّبها قبل معالِج المسار.
 */
function collectRouterGuards(src) {
  const clean = blankComments(src);
  const rules = [];
  const call = /\brouter\.use\s*\(/g;
  let match;

  while ((match = call.exec(clean)) !== null) {
    const args = readArgs(clean, match.index + match[0].length - 1);
    if (!args.length) continue;

    const first = args[0].text.trim();
    let prefixes = null;

    if (first.charAt(0) === '[') {
      prefixes = [];
      const inner = first.slice(1, first.lastIndexOf(']'));
      for (const part of splitTopLevel(inner)) {
        const literal = firstLiteral(part.text);
        if (literal) prefixes.push(literal.value);
      }
    } else if (/^['"`]/.test(first)) {
      const literal = firstLiteral(first);
      prefixes = literal ? [literal.value] : null;
    }

    const candidates = prefixes ? args.slice(1) : args;
    const guards = candidates
      .map((arg) => arg.text.trim())
      .filter((token) => GUARD_NAMES.indexOf(token) !== -1);

    if (guards.length) rules.push({ prefixes: prefixes || [''], guards: uniq(guards), at: match.index });
  }

  return rules;
}

/** حارس الراوتر يشمله فقط إن كان مسجَّلاً قبله في الملف نفسه (ترتيب Express). */
function guardsForPath(innerPath, rules, routeIndex) {
  const found = [];
  for (const rule of rules) {
    if (rule.at > routeIndex) continue;
    const applies = rule.prefixes.some((prefix) => {
      if (prefix === '') return true;
      const base = prefix.replace(/\/$/, '');
      return innerPath === base || innerPath.indexOf(base + '/') === 0;
    });
    if (applies) for (const guard of rule.guards) found.push(guard);
  }
  return uniq(found);
}

// ---------------------------------------------------------------------------
// جامعو البيانات
// ---------------------------------------------------------------------------

function collectEndpoints() {
  const dir = 'server/src/routes';
  const mountFor = resolveMounts();
  const files = listDir(dir)
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'index.js')
    .map((entry) => entry.name)
    .sort(compare);

  const endpoints = [];
  for (const name of files) {
    const rel = dir + '/' + name;
    const src = read(rel);
    const clean = blankComments(src);
    const routerGuards = collectRouterGuards(src);
    const call = /([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|all)\s*\(/g;
    let match;
    while ((match = call.exec(clean)) !== null) {
      const routerVar = match[1];
      if (routerVar !== 'router' && !/Router$/.test(routerVar)) continue;

      const args = readArgs(clean, match.index + match[0].length - 1);
      const pathLiteral = firstLiteral(args[0] ? args[0].text : '');
      if (!pathLiteral || pathLiteral.template) continue;

      const guards = [];
      for (const arg of args.slice(1, -1)) {
        const token = arg.text.trim();
        if (GUARD_NAMES.indexOf(token) !== -1) guards.push(token);
      }
      for (const guard of guardsForPath(pathLiteral.value, routerGuards, match.index)) guards.push(guard);

      const mount = mountFor(rel, routerVar);
      endpoints.push({
        method: match[2].toUpperCase(),
        path: joinPath(mount.base, mount.prefix, pathLiteral.value),
        guards: uniq(guards),
        file: rel,
        line: lineOf(clean, match.index)
      });
    }
  }

  return endpoints.sort((a, b) => compare(a.path, b.path) || compare(a.method, b.method) || a.line - b.line);
}

function collectServices() {
  const dir = 'server/src/services';
  const files = listDir(dir)
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort(compare);

  const services = [];
  for (const name of files) {
    const rel = dir + '/' + name;
    const src = read(rel);
    const at = src.indexOf('module.exports');
    if (at === -1) continue;

    const open = src.indexOf('{', at);
    if (open === -1) continue;

    // مطابقة القوس الحاكم لجسم module.exports
    let depth = 0;
    let close = -1;
    let quote = null;
    for (let i = open; i < src.length; i += 1) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
      if (ch === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        i = nl < 0 ? src.length : nl;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close === -1) continue;

    const bodyStart = open + 1;
    const body = src.slice(bodyStart, close);
    const exports = [];
    for (const part of splitTopLevel(body)) {
      const text = stripComments(part.text).trim();
      if (!text) continue;
      const colon = text.indexOf(':');
      const head = (colon === -1 ? text : text.slice(0, colon)).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(head)) continue;
      exports.push({ name: head, line: lineOf(src, bodyStart + part.start + offsetOfKey(part.text, head)) });
    }

    services.push({ file: rel, name, exports });
  }

  return services;
}

function collectTables() {
  const rel = 'server/src/db/schema.sql';
  const src = read(rel);
  const tables = [];
  for (const match of src.matchAll(/CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][\w]*)/g)) {
    tables.push({ name: match[1], line: lineOf(src, match.index) });
  }
  return tables.sort((a, b) => compare(a.name, b.name));
}

function collectMigrations() {
  const rel = 'server/src/db/dataMigrations.js';
  const src = read(rel);
  const stepsStart = src.indexOf('const steps = [');
  const steps = [];
  for (const match of src.matchAll(/name:\s*'([^']*)'/g)) {
    steps.push({
      name: match[1],
      line: lineOf(src, match.index),
      seed: stepsStart !== -1 && match.index < stepsStart
    });
  }
  return steps.sort((a, b) => a.line - b.line);
}

function collectChannels() {
  const files = walk('server/src', (f) => f.endsWith('.js'));
  const channels = [];
  for (const rel of files) {
    const src = read(rel);
    const call = /[A-Za-z_$][\w$.]*\s*\.\s*emit\s*\(/g;
    let match;
    while ((match = call.exec(src)) !== null) {
      const args = readArgs(src, match.index + match[0].length - 1);
      const literal = firstLiteral(args[0] ? args[0].text : '');
      if (!literal) continue;
      channels.push({ channel: literal.value, file: rel, line: lineOf(src, match.index) });
    }
  }
  return channels.sort((a, b) => compare(a.file, b.file) || a.line - b.line);
}

function collectTests(rel) {
  const src = read(rel);
  const cases = [];
  for (const match of src.matchAll(/await\s+test\s*\(/g)) {
    const args = readArgs(src, match.index + match[0].length - 1);
    const literal = firstLiteral(args[0] ? args[0].text : '');
    if (!literal) continue;
    cases.push({ name: literal.value, file: rel, line: lineOf(src, match.index) });
  }
  return cases;
}

function collectWebFunctions() {
  const files = listDir('web')
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort(compare);

  const functions = [];
  for (const name of files) {
    const rel = 'web/' + name;
    const src = read(rel);
    const seen = new Set();

    const push = (fnName, index) => {
      const line = lineOf(src, index);
      const key = fnName + ':' + line;
      if (seen.has(key)) return;
      seen.add(key);
      functions.push({ name: fnName, file: rel, line });
    };

    for (const match of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      push(match[1], match.index);
    }
    for (const match of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/gm)) {
      push(match[1], match.index);
    }
  }

  return functions.sort((a, b) => compare(a.file, b.file) || a.line - b.line);
}

function collectMobile() {
  const modelsDir = 'mobile/lib/models';
  const modelFiles = exists(modelsDir)
    ? listDir(modelsDir).filter((e) => e.isFile() && e.name.endsWith('.dart')).map((e) => e.name).sort(compare)
    : [];
  const files = ['mobile/lib/api/negev_api.dart'].concat(modelFiles.map((name) => modelsDir + '/' + name));

  const items = [];
  for (const rel of files) {
    if (!exists(rel)) continue;
    const src = read(rel);
    const push = (label, index) => items.push({ label, file: rel, line: lineOf(src, index) });

    for (const match of src.matchAll(/^class\s+([A-Za-z]\w*)/gm)) push(match[1], match.index);

    // أعضاء عامة: دوال، بانيات مسمّاة، وgetters — على مسافة بادئة 2 (أعضاء الصنف في Dart).
    // يقبل `?` بعد كل نوع إرجاع قائم، مثل `String?` و`List<T>?`، وgeneric متعدد الأسطر.
    const member = /^ {2}(?:static\s+)?(?:Future<(?:[^\n]*\n)*?[^\n]*?>|void|String|int|double|bool|num|List<[^\n]*?>|Map<[^\n]*?>|Set<[^\n]*?>|Object|[A-Z]\w*)\??\s+([a-zA-Z]\w*)\s*\(/gm;
    for (const match of src.matchAll(member)) push(match[1], match.index);

    const named = /^ {2}(?:factory\s+|const\s+)?([A-Z]\w*)\.([a-zA-Z]\w*)\s*\(/gm;
    for (const match of src.matchAll(named)) push(match[1] + '.' + match[2], match.index);

    const getter = /^ {2}(?:static\s+)?[\w<>?,\s]+?\s+get\s+([a-zA-Z]\w*)/gm;
    for (const match of src.matchAll(getter)) push(match[1] + ' (get)', match.index);
  }

  return items.sort((a, b) => compare(a.file, b.file) || a.line - b.line);
}

function collectEnv() {
  const example = read('server/.env.example');
  const names = [];
  for (const match of example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) names.push(match[1]);

  const sourceFiles = walk('server/src', (f) => f.endsWith('.js'));
  const envNamesIn = (src) => {
    const found = [];
    for (const match of src.matchAll(/\bprocess\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])/g)) {
      found.push(match[1] || match[2]);
    }
    return found;
  };
  const readersOf = (name) => {
    const readers = [];
    for (const rel of sourceFiles) {
      const src = read(rel);
      for (const match of src.matchAll(new RegExp('\\bprocess\\.env(?:\\.' + name + '\\b|\\[\\s*[\'\"]' + name + '[\'\"]\\s*\\])', 'g'))) {
        readers.push({ file: rel, line: lineOf(src, match.index) });
      }
    }
    return readers.sort((a, b) => {
      const aConfig = a.file === 'server/src/config/index.js';
      const bConfig = b.file === 'server/src/config/index.js';
      if (aConfig !== bConfig) return aConfig ? -1 : 1;
      return compare(a.file, b.file) || a.line - b.line;
    }).slice(0, 2);
  };
  const dockerReadersOf = (name) => {
    const rel = 'docker-compose.yml';
    const src = read(rel);
    const readers = [];
    for (const match of src.matchAll(new RegExp('\\$\\{' + name + '(?=[:}])', 'g'))) {
      readers.push({ file: rel, line: lineOf(src, match.index), docker: true });
    }
    return readers.slice(0, 2);
  };
  const readersFor = (name) => {
    const readers = readersOf(name);
    return readers.length ? readers : dockerReadersOf(name);
  };

  const variables = names.map((name) => ({ name, readers: readersFor(name) }));

  const documented = new Set(names);
  const undocumented = [];
  for (const rel of sourceFiles) {
    for (const name of envNamesIn(read(rel))) {
      if (!documented.has(name) && undocumented.indexOf(name) === -1) undocumented.push(name);
    }
  }

  return {
    variables,
    undocumented: undocumented.sort(compare).map((name) => ({ name, readers: readersFor(name) }))
  };
}

// ---------------------------------------------------------------------------
// بناء INDEX.md
// ---------------------------------------------------------------------------

function moduleStats(relDir, filter) {
  const files = walk(relDir, filter);
  let lines = 0;
  for (const rel of files) lines += countLines(read(rel));
  return { files: files.length, lines };
}

function breakdown(relDir, filter) {
  const rows = [];
  for (const entry of listDir(relDir).sort((a, b) => compare(a.name, b.name))) {
    const rel = relDir + '/' + entry.name;
    if (entry.isDirectory()) {
      const stats = moduleStats(rel, filter);
      if (stats.files > 0) rows.push({ label: '`' + entry.name + '/`', ...stats });
    } else if (filter(rel)) {
      rows.push({ label: '`' + entry.name + '`', files: 1, lines: countLines(read(rel)) });
    }
  }
  return rows;
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(headers, rows) {
  const out = [];
  out.push('| ' + headers.join(' | ') + ' |');
  out.push('|' + headers.map(() => '---').join('|') + '|');
  for (const row of rows) out.push('| ' + row.map(cell).join(' | ') + ' |');
  return out;
}

function collectAll() {
  const endpoints = collectEndpoints();
  const services = collectServices();
  const tables = collectTables();
  const migrations = collectMigrations();
  const channels = collectChannels();
  const tests = collectTests('server/test/smoke.test.js').concat(collectTests('server/test/web-dom.test.js'))
    .sort((a, b) => compare(a.file, b.file) || a.line - b.line);
  const webFunctions = collectWebFunctions();
  const mobile = collectMobile();
  const env = collectEnv();
  const pkg = JSON.parse(read('server/package.json'));

  const serverStats = moduleStats('server/src', (f) => f.endsWith('.js'));
  const webStats = moduleStats('web', (f) => f.endsWith('.js'));
  const mobileStats = moduleStats('mobile/lib', () => true);

  const serviceExports = services.reduce((sum, service) => sum + service.exports.length, 0);

  return {
    endpoints,
    services,
    tables,
    migrations,
    channels,
    tests,
    webFunctions,
    mobile,
    env,
    pkg,
    serverStats,
    webStats,
    mobileStats,
    serviceExports
  };
}

function buildMainIndex(data) {
  const { endpoints, services, tables, channels, migrations, pkg, serverStats, webStats, mobileStats } = data;

  const lines = [];
  const push = (...items) => lines.push(...items);

  push('# فهرس المشروع — منصة مناسبات النقب');
  push('');
  push('> **مولَّد من `server/scripts/build-index.js` — لا تحرّره بيدك؛ شغّل `npm run index:build`.**');
  push('> بوابة التقادم: `npm run index:check` (مدمجة في `npm test`) تفشل عند أي اختلاف — في هذا الملف أو أحد ملحقيه.');
  push('>');
  push('> ابدأ من هنا، ثم افتح `ملف:سطر` مباشرة. لا طابع زمني ولا مسار مطلق في هذا الملف، والمخرج حتمي بالكامل.');
  push('> بحث عن دالة أو تصدير أو خطوة ترحيل أو متغير بيئة ← `INDEX-code.md`.');
  push('> بحث عن حالة اختبار ← `INDEX-tests.md`.');
  push('> الأحجام أدناه بالأسطر غير الفارغة: `server/src` ملفات `.js` وحدها، و`web` ملفات `.js`، و`mobile/lib` كل الملفات.');
  push('');

  // ١ — الوحدات
  push('## ١. خريطة الوحدات');
  push('');
  push(...table(['الوحدة', 'الملفات', 'الأسطر'], [
    ['`server/src`', serverStats.files, serverStats.lines],
    ['`web`', webStats.files, webStats.lines],
    ['`mobile/lib`', mobileStats.files, mobileStats.lines]
  ]));
  push('');
  push('### توزيع `server/src`');
  push('');
  push(...table(['المجلد/الملف', 'الملفات', 'الأسطر'],
    breakdown('server/src', (f) => f.endsWith('.js')).map((row) => [row.label, row.files, row.lines])));
  push('');
  push('### ملفات `web/*.js`');
  push('');
  push(...table(['الملف', 'الأسطر'],
    breakdown('web', (f) => f.endsWith('.js')).filter((row) => row.files === 1).map((row) => [row.label, row.lines])));
  push('');
  push('`web/` كله HTML وCSS بلا خطوة بناء؛ `web/serve.js` خادم الملفات الثابتة المحلي وحده.');
  push('');
  push('### توزيع `mobile/lib`');
  push('');
  push(...table(['المجلد/الملف', 'الملفات', 'الأسطر'],
    breakdown('mobile/lib', () => true).map((row) => [row.label, row.files, row.lines])));
  push('');

  // ٢ — المهمة ← الملفات
  push('## ٢. المهمة ← الملفات');
  push('');
  // أول استدعاء مسار حقيقي في ملف — لا `req.get(...)` ولا `res.get(...)`.
  const ROUTE_CALL = /^[ \t]*router\s*\.\s*(get|post|put|patch|delete|all)\s*\(/m;
  const routesIndexUse = anchor('server/src/routes/index.js', /router\.use\([A-Za-z_$]/);
  const lastMigration = migrations.length ? migrations[migrations.length - 1] : null;
  const routeChannel = channels.filter((channel) => channel.file.indexOf('server/src/routes/') === 0)[0];
  const taskRows = [
    ['إضافة نقطة API', routesIndexUse + ' للتركيب، ثم `server/src/routes/<المجال>.routes.js` — مثل '
      + anchor('server/src/routes/events.routes.js', ROUTE_CALL)
      + ' — والخدمة `server/src/services/events.service.js`'],
    ['تغيير حقل أو جدول', '`server/src/db/schema.sql` (للتنصيبات الجديدة) + خطوة جديدة في `server/src/db/dataMigrations.js` — آخر خطوة اليوم '
      + (lastMigration ? '`server/src/db/dataMigrations.js:' + lastMigration.line + '`' : '`server/src/db/dataMigrations.js`')],
    ['رفع صورة أو وسيط', anchor('server/src/middleware/upload.js', /module\.exports/) + ' · '
      + anchor('server/src/services/cloudinary.service.js', /storeUploadedImage/)],
    ['الصلاحيات والمصادقة', anchor('server/src/middleware/auth.js', /function requireAdmin/) + ' · '
      + anchor('server/src/routes/admin.routes.js', ROUTE_CALL)],
    ['بثّ لحظي (Socket.IO)', anchor('server/src/realtime/index.js', /function emit/) + ' · '
      + (routeChannel ? '`' + routeChannel.file + ':' + routeChannel.line + '`' : '`server/src/routes/`')],
    ['واجهة الويب', anchor('web/app.js', /^function /m) + ' · `web/admin.js` · ' + anchor('web/api.js', /function apiFetch/)],
    ['تطبيق الموبايل', anchor('mobile/lib/api/negev_api.dart', /^class NegevApi/m) + ' · `mobile/lib/screens/` · `mobile/lib/models/`']
  ];
  push(...table(['المهمة', 'ابدأ من'], taskRows));
  push('');
  push('قاعدة الطبقات: المسار يتحقق والخدمة تستعلم — لا SQL خارج `server/src/services/`، ولا `req`/`res` داخلها.');
  push('');

  // ٣ — نقاط API
  push('## ٣. نقاط API — ' + endpoints.length);
  push('');
  push('المسار الكامل = جذر التركيب في `server/src/app.js` + تركيب الراوتر في `server/src/routes/index.js` + المسار داخل الملف.');
  push('راوترات `share.routes.js` تُركَّب على الجذور `/e` `/p` `/a` `/person` `/live` `/v` مباشرةً في `server/src/app.js`، لا تحت `/api`.');
  push('الحرّاس: معرّفات المصادقة في الاستدعاء نفسه، أو في `router.use(بادئة, حارس)` أعلى الملف فتشمل المسار؛ `asyncHandler` ومحدِّدات المعدّل ليست حرّاساً.');
  push('');
  push(...table(['METHOD', 'path', 'guards', 'file:line'],
    endpoints.map((endpoint) => [
      endpoint.method,
      '`' + endpoint.path + '`',
      endpoint.guards.length ? endpoint.guards.map((g) => '`' + g + '`').join(', ') : '—',
      '`' + endpoint.file + ':' + endpoint.line + '`'
    ])));
  push('');

  // ٤ — الجداول ← الخدمات
  push('## ٤. جدول قاعدة البيانات ← الخدمة — ' + tables.length + ' جدولاً');
  push('');
  push('الجدول من `server/src/db/schema.sql`، والخدمات التي يظهر اسمها في كودها (بحث لفظي بحدود الكلمة).');
  push('');
  push(...table(['الجدول', 'خدمات تذكره'], tables.map((table_) => {
    const owners = services
      .filter((service) => new RegExp('\\b' + table_.name + '\\b').test(read(service.file)))
      .map((service) => '`' + service.name + '`');
    return ['`' + table_.name + '`', owners.length ? owners.join(', ') : '—'];
  })));
  push('');

  // ٥ — قنوات Socket.IO
  push('## ٥. قنوات Socket.IO — ' + channels.length + ' بثّاً');
  push('');
  push('كل بثّ في `server/src` بأول وسيط نصّي؛ القنوات ذات المعرّفات تبقى قوالب (`_<id>` في المصدر).');
  push('`emit` العام في `server/src/realtime/index.js` هو الموصل نفسه لا قناة.');
  push('');
  push(...table(['القناة', 'file:line'], channels.map((channel) => [
    '`' + channel.channel + '`',
    '`' + channel.file + ':' + channel.line + '`'
  ])));
  push('');

  // ٦ — الأوامر والبوابات
  push('## ٦. الأوامر والبوابات');
  push('');
  push('من `server/package.json` — تُشغَّل من داخل `server/` (أو `npm --prefix server <script>` من الجذر).');
  push('');
  push(...table(['السكربت', 'الأمر'], Object.keys(pkg.scripts).map((name) => [
    '`' + name + '`',
    '`' + pkg.scripts[name] + '`'
  ])));
  push('');
  push('بوابة التقادم: `index:check` تفحص `INDEX.md` و`INDEX-code.md` و`INDEX-tests.md` معاً، وأول ما يشغّله `test`. '
    + 'و`flutter` خارج `npm test` كلياً: `flutter analyze` و`flutter test` من داخل `mobile/`.');
  push('');

  return lines.join('\n');
}

function buildCodeIndex(data) {
  const { services, migrations, webFunctions, mobile, env, serviceExports } = data;

  const lines = [];
  const push = (...items) => lines.push(...items);

  push('# ملحق الكود — منصة مناسبات النقب');
  push('');
  push('> **مولَّد من `server/scripts/build-index.js` — لا تحرّره بيدك؛ شغّل `npm run index:build`.**');
  push('> ملحق `INDEX.md`: صادرات الخدمات، وخطوات الترحيل، ودوال الويب، والموبايل، ومتغيرات البيئة.');
  push('');

  // ١ — صادرات الخدمات
  push('## ١. صادرات الخدمات — ' + serviceExports + ' تصديراً في ' + services.length + ' خدمة');
  push('');
  push('كل خدمة تُصدِّر كائن `module.exports = { ... }` بنمط واحد؛ الأسماء كما هي في الملف مع سطرها.');
  push('');
  const exportRows = [];
  for (const service of services) {
    for (const item of service.exports) {
      exportRows.push(['`' + item.name + '`', '`' + service.file + ':' + item.line + '`']);
    }
  }
  push(...table(['التصدير', 'file:line'], exportRows));
  push('');

  // ٢ — الترحيل
  const seedNames = migrations.filter((step) => step.seed).length;
  push('## ٢. خطوات الترحيل — ' + migrations.length + ' مدخلاً');
  push('');
  push('تُطبَّق بالترتيب بعد `schema.sql`؛ لا تُعدَّل خطوة قديمة، تُضاف خطوة جديدة في آخر `steps`.'
    + (seedNames ? ' و' + seedNames + ' من المدخلات أسماء أنواع مناسبات مزروعة داخل خطوة، ليست خطوات مستقلة.' : ''));
  push('');
  push(...table(['الخطوة', 'file:line'], migrations.map((step) => [
    '`' + step.name + '`',
    '`server/src/db/dataMigrations.js:' + step.line + '`'
  ])));
  push('');

  // ٣ — الويب
  push('## ٣. الويب — ' + webFunctions.length + ' دالة عليا');
  push('');
  push('الدوال العليا في `web/*.js` وحدها، مجموعة بالملف ثم السطر. لا استيراد ولا خطوة بناء.');
  push('');
  push(...table(['الدالة', 'file:line'], webFunctions.map((fn) => [
    '`' + fn.name + '`',
    '`' + fn.file + ':' + fn.line + '`'
  ])));
  push('');

  // ٤ — الموبايل
  push('## ٤. الموبايل — ' + mobile.length + ' عنصراً عاماً (مختصر)');
  push('');
  push('الكلاسات والأعضاء العامة في `mobile/lib/api/negev_api.dart` و`mobile/lib/models/*.dart`؛ الشاشات في `mobile/lib/screens/`.');
  push('');
  push(...table(['العنصر', 'file:line'], mobile.map((item) => [
    '`' + item.label + '`',
    '`' + item.file + ':' + item.line + '`'
  ])));
  push('');

  // ٥ — متغيرات البيئة
  push('## ٥. متغيرات البيئة — ' + env.variables.length);
  push('');
  push('الأسماء من `server/.env.example`، وكل قارئ من `server/src` موثّق بموضعه (موضعان كحد أقصى)؛ قارئ Docker-only معلّم صراحةً كذلك.');
  push('');
  const formatReaders = (readers) => readers.map((reader) => {
    const location = '`' + reader.file + ':' + reader.line + '`';
    return reader.docker ? location + ' (docker فقط؛ لا يقرأه `server/src`)' : location;
  }).join(', ');
  push(...table(['المتغيّر', 'يقرؤه'], env.variables.map((variable) => [
    '`' + variable.name + '`',
    formatReaders(variable.readers)
  ])));
  if (env.undocumented.length) {
    push('');
    push('### متغيرات إضافية يقرؤها `server/src`');
    push('');
    push('لها افتراضيات في الكود وليست في `.env.example`.');
    push('');
    push(...table(['المتغيّر', 'يقرؤه'], env.undocumented.map((variable) => [
      '`' + variable.name + '`',
      formatReaders(variable.readers)
    ])));
  }
  push('');

  return lines.join('\n');
}

function buildTestsIndex(data) {
  const { tests } = data;

  const lines = [];
  const push = (...items) => lines.push(...items);

  push('# ملحق الاختبارات — منصة مناسبات النقب');
  push('');
  push('> **مولَّد من `server/scripts/build-index.js` — لا تحرّره بيدك؛ شغّل `npm run index:build`.**');
  push('> ملحق `INDEX.md`: كل حالة `await test(` في ملفَي الاختبار، مرتّبة بالملف ثم السطر.');
  push('');
  push('## حالات الاختبار — ' + tests.length);
  push('');
  push('`npm test` يشغّل `web-dom` ثم `smoke`؛ `smoke` يحتاج MySQL حيّة، وكل حالة معرَّفة داخل ملفها.');
  push('');
  push(...table(['الحالة', 'file:line'], tests.map((test) => [
    '`' + test.name + '`',
    '`' + test.file + ':' + test.line + '`'
  ])));
  push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// التنفيذ
// ---------------------------------------------------------------------------

function readPublished(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function reportDiff(name, expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const total = Math.max(expectedLines.length, actualLines.length);
  let shown = 0;

  console.error(name + ' متقادم — أول الأسطر المختلفة:');
  for (let i = 0; i < total && shown < 6; i += 1) {
    if (expectedLines[i] === actualLines[i]) continue;
    shown += 1;
    console.error('  السطر ' + (i + 1) + ':');
    console.error('    الموجود: ' + (actualLines[i] === undefined ? '(لا سطر)' : actualLines[i]));
    console.error('    المتوقع: ' + (expectedLines[i] === undefined ? '(لا سطر)' : expectedLines[i]));
  }
}

function main() {
  const data = collectAll();
  const files = [
    { name: 'INDEX.md', path: INDEX_PATH, content: buildMainIndex(data) },
    { name: 'INDEX-code.md', path: CODE_PATH, content: buildCodeIndex(data) },
    { name: 'INDEX-tests.md', path: TESTS_PATH, content: buildTestsIndex(data) }
  ];

  if (!CHECK) {
    for (const file of files) {
      fs.writeFileSync(file.path, file.content, 'utf8');
      console.log('كُتب ' + file.name + ' — ' + file.content.split('\n').length + ' سطراً.');
    }
    return 0;
  }

  let stale = false;

  for (const file of files) {
    const existing = readPublished(file.path);
    if (existing === null) {
      console.error(file.name + ' غير موجود — شغّل: npm run index:build');
      stale = true;
      continue;
    }

    const actual = existing.replace(/\r\n/g, '\n');
    if (actual === file.content) continue;

    reportDiff(file.name, file.content, actual);
    stale = true;
  }

  if (stale) {
    console.error('شغّل: npm run index:build');
    return 1;
  }

  console.log('INDEX.md وملحقاه مطابقة للمولَّد — الفهرس حديث.');
  return 0;
}

process.exitCode = main();
