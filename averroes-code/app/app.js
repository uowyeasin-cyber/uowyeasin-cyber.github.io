// Averroes Code for phones: an installable web app (PWA). Code editor with
// Run for HTML/CSS/JavaScript and Python, the 23 courses, and the practice
// judge. Everything is saved on the phone and works offline after one visit.

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const store = {
  get(k, d) { try { const v = localStorage.getItem(`avc:${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`avc:${k}`, JSON.stringify(v)); } catch { /* full or blocked */ } },
};
const state = { tab: store.get('tab', 'code'), lang: store.get('lang', 'en') };
const cache = new Map();
async function data(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`data/${path}`).then((r) => { if (!r.ok) throw new Error(`Could not load ${path} (connect once to download it).`); return r.json(); });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

// ---------- tiny DOM helpers ----------
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
function sheet(...kids) {
  $sheet.replaceChildren(h('div', { class: 'panel' }, ...kids));
  $sheet.classList.remove('hidden');
}
$sheet.addEventListener('click', (e) => { if (e.target === $sheet) $sheet.classList.add('hidden'); });
const closeSheet = () => $sheet.classList.add('hidden');

// ---------- markdown (headings, lists, code, tables, bold, italics, links) ----------
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function md(src) {
  const out = [];
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = [];
      while (++i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    } else if (/^#{1,4} /.test(l)) {
      const n = Math.min(3, l.match(/^#+/)[0].length);
      out.push(`<h${n}>${inline(l.replace(/^#+ /, ''))}</h${n}>`);
    } else if (/^\s*[-*] /.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*] /, ''))}</li>`);
      i--; out.push(`<ul>${items.join('')}</ul>`);
    } else if (/^\s*\d+\. /.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+\. /, ''))}</li>`);
      i--; out.push(`<ol>${items.join('')}</ol>`);
    } else if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { if (!/^\|[\s:|-]+\|$/.test(lines[i])) rows.push(lines[i]); i++; }
      i--;
      out.push(`<table>${rows.map((r, ri) => `<tr>${r.replace(/^\||\|$/g, '').split('|').map((c) => `<${ri ? 'td' : 'th'}>${inline(c.trim())}</${ri ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`);
    } else if (l.trim()) {
      const buf = [l];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(```|#|\s*[-*] |\s*\d+\. |\|)/.test(lines[i + 1])) buf.push(lines[++i]);
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
  }
  return h('div', { class: 'md', html: out.join('') });
}

// ---------- running code ----------
const LANGS = {
  python: { name: 'Python', ext: 'py', starter: 'name = input("Your name: ")\nprint("Hello,", name)\n' },
  javascript: { name: 'JavaScript', ext: 'js', starter: 'const nums = [3, 1, 2];\nnums.sort((a, b) => a - b);\nconsole.log("Sorted:", nums.join(", "));\n' },
  c: { name: 'C', ext: 'c', starter: '#include <stdio.h>\n\nint main() {\n    int a, b;\n    scanf("%d %d", &a, &b);\n    printf("Sum = %d\\n", a + b);\n    return 0;\n}\n' },
  cpp: { name: 'C++', ext: 'cpp', starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n    for (int i = 1; i <= n; i++) cout << i * i << " ";\n    cout << endl;\n    return 0;\n}\n' },
  html: { name: 'HTML / CSS / JS', ext: 'html', starter: '<!DOCTYPE html>\n<html>\n<head>\n<style>\n  body { font-family: sans-serif; text-align: center; padding: 30px; }\n  button { font-size: 20px; padding: 10px 20px; }\n</style>\n</head>\n<body>\n  <h1>Hello!</h1>\n  <button onclick="n++; this.textContent = \'Clicked \' + n">Click me</button>\n  <script>let n = 0;</script>\n</body>\n</html>\n' },
};
const workers = {};
function worker(kind) {
  if (!workers[kind]) workers[kind] = new Worker(kind === 'python' ? 'py-worker.js' : kind === 'c' || kind === 'cpp' ? 'cpp-worker.js' : 'js-worker.js');
  return workers[kind];
}
// Run once with stdin; a stuck program is stopped after `limit` ms.
function run(kind, code, stdin = '', limit = 8000) {
  return new Promise((resolve) => {
    const w = worker(kind);
    let started = kind !== 'python' || workers.pyReady;
    let timer = started ? setTimeout(stop, limit) : null;
    function stop() {
      w.terminate(); delete workers[kind]; if (kind === 'python') workers.pyReady = false;
      resolve({ out: '', err: `Stopped: the program ran longer than ${Math.round(limit / 1000)} s (maybe an endless loop, or it waits for more input).`, timedOut: true });
    }
    w.onmessage = (e) => {
      if ('ready' in e.data) {
        workers.pyReady = e.data.ready;
        if (!started) { started = true; timer = setTimeout(stop, limit); }
        return;
      }
      clearTimeout(timer);
      resolve(e.data);
    };
    w.postMessage({ code, stdin });
  });
}
const sameOutput = (a, b) => {
  const norm = (s) => String(s).replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
  if (norm(a) === norm(b)) return true;
  const t = (s) => String(s).split(/\s+/).filter(Boolean);
  const x = t(a); const y = t(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

// Colours for code: one regex per language, each match painted by its group.
const KW = {
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield print input len range int str float list dict set',
  javascript: 'async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield console',
  c: 'auto break case char const continue default do double else enum extern float for goto if int long return short signed sizeof static struct switch typedef union unsigned void while bool true false include define using namespace std class public private protected new delete template typename cout cin endl vector string',
  java: 'abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import int interface long new null package private protected public return short static super switch this throw throws true false try void while String System',
};
KW.cpp = KW.c;
const escH = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function paintCode(code, lang) {
  if (lang === 'html') {
    return escH(code).replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([\w-]+)|([\w-]+)(=)(&quot;[^&]*&quot;|"[^"]*")/g,
      (m, com, lt, tag, attr, eq, val) => (com ? `<i class="t-c">${com}</i>` : tag ? `${lt}<i class="t-k">${tag}</i>` : `<i class="t-a">${attr}</i>${eq}<i class="t-s">${val}</i>`));
  }
  const kws = new Set((KW[lang] || KW.python).split(' '));
  const comment = lang === 'python' ? '#.*' : '\\/\\/.*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)';
  const re = new RegExp(`(${comment})|("(?:\\\\.|[^"\\\\\\n])*"?|'(?:\\\\.|[^'\\\\\\n])*'?|\`[^\`]*\`?)|(\\b\\d[\\d._]*\\b)|([A-Za-z_]\\w*)(\\s*\\()?|(#\\s*\\w+)`, 'g');
  let out = ''; let last = 0;
  code.replace(re, (m, com, str, num, word, call, pre, at) => {
    out += escH(code.slice(last, at)); last = at + m.length;
    if (com) out += `<i class="t-c">${escH(com)}</i>`;
    else if (str) out += `<i class="t-s">${escH(str)}</i>`;
    else if (num) out += `<i class="t-n">${num}</i>`;
    else if (pre) out += `<i class="t-k">${escH(pre)}</i>`;
    else if (kws.has(word)) out += `<i class="t-k">${word}</i>${call || ''}`;
    else if (call) out += `<i class="t-f">${word}</i>${call}`;
    else out += word;
    return m;
  });
  return out + escH(code.slice(last));
}

// An editor with line numbers, colours and a row of symbol keys that phone keyboards hide.
function editor(value, onChange, lang = 'python') {
  const ta = h('textarea', { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', 'aria-label': 'Code' });
  const gutter = h('div', { class: 'gutter', 'aria-hidden': 'true' });
  const shade = h('pre', { class: 'shade', 'aria-hidden': 'true' });
  ta.value = value;
  const repaint = () => {
    const n = ta.value.split('\n').length;
    if (gutter.childElementCount !== n) gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
    shade.innerHTML = `${paintCode(ta.value, lang)}\n`;
    shade.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
  };
  ta.addEventListener('scroll', () => {
    shade.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
  });
  ta.addEventListener('input', () => { repaint(); onChange(ta.value); });
  const insert = (text, back = 0) => {
    const s = ta.selectionStart; const e = ta.selectionEnd;
    ta.setRangeText(text, s, e, 'end');
    if (back) ta.selectionStart = ta.selectionEnd = ta.selectionStart - back;
    ta.focus(); repaint(); onChange(ta.value);
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); insert('    '); }
    if (e.key === 'Enter') {
      const before = ta.value.slice(0, ta.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const indent = line.match(/^\s*/)[0] + (/[:{([]\s*$/.test(line) ? '    ' : '');
      e.preventDefault(); insert(`\n${indent}`);
    }
  });
  const keys = ['⇥', '(', ')', '{', '}', '[', ']', ':', ';', '"', "'", '=', '<', '>', '+', '-', '*', '/', '%', '!', '&', '|', '#', '_', '.', ','];
  const pairs = { '(': ')', '{': '}', '[': ']', '"': '"', "'": "'" };
  const bar = h('div', { class: 'keys' }, ...keys.map((k) => h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => (k === '⇥' ? insert('    ') : pairs[k] ? insert(k + pairs[k], 1) : insert(k)) }, k)));
  const wrap = h('div', {}, h('div', { class: 'editor' }, h('div', { class: 'gut' }, gutter), h('div', { class: 'code' }, shade, ta)), bar);
  wrap.textarea = ta;
  requestAnimationFrame(repaint);
  wrap.lang = lang;
  return wrap;
}

function outputBox() {
  const pre = h('pre', {}, '');
  const head = h('div', { class: 'out-head' }, 'Output');
  const box = h('div', { class: 'out hidden' }, head, pre);
  return {
    el: box,
    show(title, text, isErr) { box.classList.remove('hidden'); head.textContent = title; pre.replaceChildren(); if (text) pre.append(h('span', { class: isErr ? 'err' : '' }, text)); pre.hidden = false; box.querySelector('iframe')?.remove(); },
    add(text, isErr) { pre.append(h('span', { class: isErr ? 'err' : '' }, text)); },
    page(html) { box.classList.remove('hidden'); head.textContent = 'Preview'; pre.hidden = true; box.querySelector('iframe')?.remove(); box.append(h('iframe', { sandbox: 'allow-scripts allow-modals allow-forms', srcdoc: html })); },
  };
}

// ---------- Code tab ----------
function codeTab() {
  const files = store.get('files', { python: LANGS.python.starter, javascript: LANGS.javascript.starter, html: LANGS.html.starter });
  let lang = store.get('codeLang', 'python');
  const out = outputBox();
  const stdin = h('textarea', { class: 'stdin', placeholder: 'Input (stdin), one value per line, used by input() / readline' });
  const ed = h('div');
  const pick = h('select', { onchange: () => { lang = pick.value; store.set('codeLang', lang); paint(); } }, ...Object.entries(LANGS).map(([id, l]) => h('option', { value: id, selected: id === lang }, l.name)));
  const runBtn = h('button', { class: 'btn primary', onclick: go }, '▶ Run');
  function paint() {
    ed.replaceChildren(editor(files[lang] ?? LANGS[lang].starter, (v) => { files[lang] = v; store.set('files', files); }, lang));
    stdin.classList.toggle('hidden', lang === 'html');
  }
  async function go() {
    const code = files[lang] ?? LANGS[lang].starter;
    if (lang === 'html') return out.page(code);
    runBtn.disabled = true;
    out.show('Running…', lang === 'python' && !workers.pyReady ? 'Starting Python (the first time it downloads, then it works offline)…' : '');
    const r = await run(lang, code, stdin.value);
    runBtn.disabled = false;
    out.show(`Output · ${r.ms ?? 0} ms`, r.out || (r.err ? '' : '(no output)'));
    if (r.err) out.add(r.err, true);
  }
  paint();
  return h('div', {},
    h('div', { class: 'edhead' }, pick, h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => { if (confirm('Replace your code with the example?')) { files[lang] = LANGS[lang].starter; store.set('files', files); paint(); } } }, 'Reset'),
      h('button', { class: 'btn', onclick: () => share(files[lang], `main.${LANGS[lang].ext}`) }, 'Share'),
      runBtn),
    ed, stdin, out.el,
    h('p', { class: 'muted small' }, 'On the phone you can run Python, JavaScript, C, C++ and web pages. C and C++ cover beginner programs (iostream, cstdio, cmath, arrays, functions); vector, string and Java need the desktop app.'));
}
async function share(text, name) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [new File([text], name, { type: 'text/plain' })] })) return await navigator.share({ files: [new File([text], name, { type: 'text/plain' })], title: name });
    if (navigator.share) return await navigator.share({ title: name, text });
  } catch { return; }
  await navigator.clipboard.writeText(text); toast('Code copied');
}

// ---------- Learn tab ----------
const progress = () => store.get('progress', {});
const markDone = (key, part) => { const p = progress(); p[key] = { ...(p[key] || {}), [part]: true }; store.set('progress', p); };
const lessonDone = (key, l) => { const p = progress()[key] || {}; return p.video && p.quiz && (!l.exercise || p.exercise); };
const initials = (t) => t.replace(/[^A-Za-z+#]/g, ' ').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '•';

async function learnTab(route = store.get('learnRoute', null)) {
  store.set('learnRoute', route);
  if (route && route.course) return route.lesson ? lessonView(route.course, route.lesson, route.part || 'video') : courseView(route.course);
  const list = await data('courses/index.json');
  const p = progress();
  return h('div', {},
    h('h1', {}, 'Courses'),
    h('p', { class: 'muted' }, 'Lessons with slides, notes, a quiz and a coding exercise. Your progress stays on this phone.'),
    h('div', { class: 'row', style: 'margin:6px 0 12px' }, h('span', { class: 'muted small' }, 'Lesson language'),
      h('select', { onchange: (e) => { state.lang = e.target.value; store.set('lang', state.lang); } }, h('option', { value: 'en', selected: state.lang === 'en' }, 'English'), h('option', { value: 'bn', selected: state.lang === 'bn' }, 'বাংলা (Bangla)'))),
    h('div', { class: 'list' }, ...list.map((c) => {
      const done = Object.keys(p).filter((k) => k.startsWith(`${c.id}/`)).length;
      return h('button', { class: 'course', onclick: () => go('learn', { course: c.id }) },
        h('div', { class: 'dot', style: `background:${c.color || '#2f8cff'}` }, initials(c.title)),
        h('div', { class: 'grow' }, h('b', {}, c.title), h('div', { class: 'muted small' }, `${c.lessons} lessons · ${c.level || ''}`),
          h('div', { class: 'bar', style: 'margin-top:6px' }, h('i', { style: `width:${Math.min(100, Math.round((done / c.lessons) * 100))}%` }))));
    })));
}
async function course(id) {
  const list = await data('courses/index.json');
  const meta = list.find((c) => c.id === id);
  const bn = state.lang === 'bn' && meta && meta.languages.includes('bn');
  return data(`courses/${bn ? 'bn/' : ''}${id}.json`);
}
async function courseView(id) {
  const c = await course(id);
  const all = c.modules.flatMap((m) => m.lessons);
  const done = all.filter((l) => lessonDone(`${id}/${l.id}`, l)).length;
  return h('div', {},
    h('button', { class: 'back', onclick: () => go('learn', null) }, '‹ All courses'),
    h('h1', {}, c.title), h('p', { class: 'muted' }, c.summary || ''),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((done / all.length) * 100)}%` })),
    h('p', { class: 'muted small' }, `${done} of ${all.length} lessons done${done === all.length ? ' · Course complete! Get your certificate in the desktop app.' : ''}`),
    ...c.modules.map((m, mi) => h('section', {},
      h('h2', {}, `${String.fromCharCode(65 + mi)}. ${m.title}`),
      h('div', { class: 'list' }, ...m.lessons.map((l) => h('button', { class: `lesson ${lessonDone(`${id}/${l.id}`, l) ? 'done' : ''}`, onclick: () => go('learn', { course: id, lesson: l.id }) },
        h('span', { class: 'check' }, lessonDone(`${id}/${l.id}`, l) ? '✓' : ''),
        h('span', { class: 'grow' }, l.title), h('span', { class: 'muted small' }, `${l.minutes || 8} min`)))))));
}

let speaking = null;
function speak(text, lang, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd && onEnd(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[`*#]/g, ''));
  u.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
  const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(lang === 'bn' ? 'bn' : 'en'));
  if (v) u.voice = v;
  u.onend = () => onEnd && onEnd();
  speaking = u;
  speechSynthesis.speak(u);
}
const stopSpeaking = () => { speaking = null; if ('speechSynthesis' in window) speechSynthesis.cancel(); };

async function lessonView(cid, lid, part) {
  const c = await course(cid);
  const all = c.modules.flatMap((m) => m.lessons);
  const idx = all.findIndex((l) => l.id === lid);
  const l = all[idx];
  if (!l) return go('learn', { course: cid });
  const key = `${cid}/${lid}`;
  const parts = [['video', 'Slides'], ['notes', 'Notes'], ['quiz', 'Quiz'], ...(l.exercise ? [['exercise', 'Exercise']] : [])];
  const body = h('div');
  const seg = h('div', { class: 'seg' }, ...parts.map(([id, label]) => h('button', { class: id === part ? 'on' : '', onclick: () => go('learn', { course: cid, lesson: lid, part: id }) }, label)));
  const nav = h('div', { class: 'btns', style: 'margin-top:16px' },
    idx > 0 ? h('button', { class: 'btn', onclick: () => go('learn', { course: cid, lesson: all[idx - 1].id }) }, '‹ Previous') : null,
    h('span', { class: 'grow' }),
    idx < all.length - 1 ? h('button', { class: 'btn', onclick: () => go('learn', { course: cid, lesson: all[idx + 1].id }) }, 'Next lesson ›') : null);
  if (part === 'video') body.append(slides(l, key, c));
  if (part === 'notes') { body.append(md(l.notes || l.summary)); markDone(key, 'notes'); }
  if (part === 'quiz') body.append(quiz(l, key));
  if (part === 'exercise') body.append(exercise(l, key, c));
  return h('div', {},
    h('button', { class: 'back', onclick: () => { stopSpeaking(); go('learn', { course: cid }); } }, `‹ ${c.title}`),
    h('h1', {}, l.title), seg, body, nav);
}
function slides(l, key, c) {
  let i = 0; let auto = false;
  const box = h('div');
  const count = h('span', { class: 'grow' });
  const playBtn = h('button', { class: 'btn primary', onclick: () => { auto = !auto; playBtn.textContent = auto ? '❚❚ Pause' : '▶ Play'; if (auto) say(); else stopSpeaking(); } }, '▶ Play');
  function say() {
    const s = l.slides[i];
    speak(s.narration || s.text, state.lang, () => { if (!auto) return; if (i < l.slides.length - 1) { i++; paint(); say(); } else { auto = false; playBtn.textContent = '▶ Play'; markDone(key, 'video'); } });
  }
  function paint() {
    const s = l.slides[i];
    box.replaceChildren(h('div', { class: 'slide' }, h('h3', {}, s.title || ''), md(s.text), s.code ? h('div', { class: 'md' }, h('pre', {}, h('code', {}, s.code))) : null,
      s.code && ['python', 'javascript', 'html'].includes(c.runLanguage) ? h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => tryIt(c.runLanguage, s.code) }, 'Try it')) : null));
    count.textContent = `${i + 1} / ${l.slides.length}`;
    if (i === l.slides.length - 1) markDone(key, 'video');
  }
  paint();
  return h('div', {}, box, h('div', { class: 'player' },
    h('button', { class: 'btn', onclick: () => { if (i > 0) { i--; paint(); if (auto) say(); } } }, '‹'),
    playBtn, count,
    h('button', { class: 'btn', onclick: () => { if (i < l.slides.length - 1) { i++; paint(); if (auto) say(); } } }, '›')),
  h('p', { class: 'muted small' }, 'Play reads the slides aloud with your phone\'s voice (for Bangla, install a Bangla voice in your phone\'s text-to-speech settings).'));
}
function tryIt(lang, code) {
  const files = store.get('files', {});
  files[lang] = code; store.set('files', files); store.set('codeLang', lang);
  stopSpeaking(); go('code');
}
function quiz(l, key) {
  let right = 0; let answered = 0;
  const result = h('p', { class: 'verdict' });
  return h('div', { class: 'quiz' }, ...(l.quiz || []).map((q, qi) => {
    const exp = h('p', { class: 'muted small hidden' }, q.explain || '');
    const opts = q.options.map((o, oi) => h('button', { class: 'opt', onclick: () => {
      if (opts.some((b) => b.disabled)) return;
      opts.forEach((b, bi) => { b.disabled = true; if (bi === q.answer) b.classList.add('right'); });
      if (oi !== q.answer) opts[oi].classList.add('wrong'); else right++;
      exp.classList.remove('hidden');
      if (++answered === l.quiz.length) {
        result.textContent = `${right} of ${l.quiz.length} correct${right === l.quiz.length ? ' · Quiz passed!' : ''}`;
        result.className = `verdict ${right === l.quiz.length ? 'AC' : 'WA'}`;
        if (right === l.quiz.length) markDone(key, 'quiz');
      }
    } }, o));
    return h('div', { class: 'card', style: 'margin-bottom:10px' }, h('b', {}, `${qi + 1}. `, q.q), ...opts, exp);
  }), result);
}
function exercise(l, key, c) {
  const ex = l.exercise;
  const lang = ['python', 'javascript'].includes(c.runLanguage) ? c.runLanguage : null;
  const saved = store.get(`ex:${key}`, ex.starter || '');
  let code = saved;
  const out = outputBox();
  const check = async () => {
    out.show('Checking…', lang === 'python' && !workers.pyReady ? 'Starting Python…' : '');
    for (const [i, t] of ex.tests.entries()) {
      const r = await run(lang, code, t.input);
      if (r.err || !sameOutput(r.out, t.output)) {
        out.show(`Test ${i + 1} of ${ex.tests.length} failed`, `Input:\n${t.input}\nExpected:\n${t.output}\nYour output:\n${r.out}`, false);
        if (r.err) out.add(`\n${r.err}`, true);
        return;
      }
    }
    out.show('All tests passed ✓', `Great work! ${ex.tests.length} of ${ex.tests.length} tests passed.`);
    markDone(key, 'exercise');
  };
  return h('div', {}, h('h3', {}, ex.title || 'Exercise'), md(ex.prompt),
    lang ? [editor(code, (v) => { code = v; store.set(`ex:${key}`, v); }, lang), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: check }, 'Check my code'), h('button', { class: 'btn', onclick: () => { if (confirm('Show the solution?')) out.show('Solution', ex.solution); } }, 'Show solution')), out.el]
      : [h('p', { class: 'muted' }, `${c.title} code runs in the desktop app. Here you can read the solution:`), h('div', { class: 'md' }, h('pre', {}, h('code', {}, ex.solution || ''))),
        h('button', { class: 'btn', onclick: () => { markDone(key, 'exercise'); toast('Marked as done'); } }, 'Mark as done')]);
}

// ---------- Practice tab ----------
async function practiceTab(route = store.get('practiceRoute', null)) {
  store.set('practiceRoute', route);
  if (route && route.problem) return problemView(route.problem);
  const list = await data('practice/index.json');
  const solved = store.get('solved', {});
  const filter = store.get('pfilter', 'all');
  const by = (d) => list.filter((p) => p.difficulty === d);
  const shown = list.filter((p) => filter === 'all' || p.difficulty === filter);
  return h('div', {},
    h('h1', {}, 'Practice'),
    h('p', { class: 'muted' }, 'Problems like LeetCode and Codeforces, checked right on your phone. Solve them in Python or JavaScript.'),
    h('div', { class: 'stat' }, ...['Easy', 'Medium', 'Hard'].map((d) => h('div', { class: 'card' }, h('b', { style: `color:var(--${d.toLowerCase()})` }, `${by(d).filter((p) => solved[p.id]).length}/${by(d).length}`), h('span', { class: 'muted small' }, d)))),
    h('div', { class: 'seg' }, ...['all', 'Easy', 'Medium', 'Hard'].map((d) => h('button', { class: filter === d ? 'on' : '', onclick: () => { store.set('pfilter', d); go('practice', null); } }, d === 'all' ? 'All' : d))),
    h('div', { class: 'list' }, ...shown.map((p) => h('button', { class: `lesson ${solved[p.id] ? 'done' : ''}`, onclick: () => go('practice', { problem: p.id }) },
      h('span', { class: 'check' }, solved[p.id] ? '✓' : ''), h('span', { class: 'grow' }, `${p.num}. ${p.title}`), h('span', { class: `tag ${p.difficulty}` }, p.difficulty)))));
}
async function problemView(id) {
  const p = await data(`practice/p/${id}.json`);
  let lang = store.get('plang', 'python');
  const codes = store.get(`pcode:${id}`, {});
  const starter = { python: 'import sys\ndata = sys.stdin.read().split()\n# solve here\n', javascript: "const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);\n// solve here\n" };
  const out = outputBox();
  const edBox = h('div');
  const paint = () => edBox.replaceChildren(editor(codes[lang] ?? starter[lang], (v) => { codes[lang] = v; store.set(`pcode:${id}`, codes); }, lang));
  paint();
  async function judge(tests, label) {
    out.show(`${label}…`, lang === 'python' && !workers.pyReady ? 'Starting Python…' : '');
    const limit = Math.max(4000, (p.timeLimitMs || 2000) * (lang === 'python' ? 4 : 3));
    for (const [i, t] of tests.entries()) {
      const r = await run(lang, codes[lang] ?? starter[lang], t.input, limit);
      const v = r.timedOut ? 'TLE' : r.err && !r.out ? 'RE' : sameOutput(r.out, t.output) ? 'AC' : r.err ? 'RE' : 'WA';
      if (v !== 'AC') {
        out.show(`${label}: test ${i + 1} of ${tests.length}`, '');
        out.add(`${{ WA: 'Wrong answer', RE: 'Runtime error', TLE: 'Time limit exceeded' }[v]}\n\n`, true);
        if (t.input.length < 2000) out.add(`Input:\n${t.input}\nExpected:\n${t.output}\nYour output:\n${r.out}\n`);
        if (r.err) out.add(r.err, true);
        return false;
      }
    }
    out.show(`${label}: all ${tests.length} passed ✓`, label === 'Submit' ? 'Accepted! Problem solved.' : 'Samples pass. Now press Submit to run the hidden tests.');
    return true;
  }
  return h('div', {},
    h('button', { class: 'back', onclick: () => go('practice', null) }, '‹ All problems'),
    h('h1', {}, `${p.num}. ${p.title}`), h('span', { class: `tag ${p.difficulty}` }, p.difficulty),
    md(p.statement), h('h3', {}, 'Input'), md(p.input), h('h3', {}, 'Output'), md(p.output),
    ...(p.samples || []).map((s, i) => h('div', { class: 'card', style: 'margin:8px 0' }, h('b', {}, `Example ${i + 1}`), h('div', { class: 'md' }, h('pre', {}, h('code', {}, `Input:\n${s.input}\nOutput:\n${s.output}`))), s.explanation ? md(s.explanation) : null)),
    h('div', { class: 'edhead', style: 'margin-top:14px' },
      h('select', { onchange: (e) => { lang = e.target.value; store.set('plang', lang); paint(); } }, h('option', { value: 'python', selected: lang === 'python' }, 'Python'), h('option', { value: 'javascript', selected: lang === 'javascript' }, 'JavaScript')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => judge(p.samples, 'Examples') }, 'Run examples'),
      h('button', { class: 'btn primary', onclick: async () => {
        let tests;
        try { tests = await data(`practice/t/${id}.json`); } catch (e) { return out.show('Offline', e.message, true); }
        if (await judge(tests, 'Submit')) { const s = store.get('solved', {}); s[id] = Date.now(); store.set('solved', s); }
      } }, 'Submit')),
    edBox, out.el,
    p.hints && p.hints.length ? h('details', { class: 'card', style: 'margin-top:12px' }, h('summary', {}, 'Hints'), ...p.hints.map((x) => md(x))) : null,
    p.editorial ? h('details', { class: 'card', style: 'margin-top:8px' }, h('summary', {}, 'Solution idea'), md(p.editorial)) : null);
}

// ---------- More tab ----------
function moreTab() {
  const p = progress();
  const lessons = Object.keys(p).length;
  const solved = Object.keys(store.get('solved', {})).length;
  return h('div', {},
    h('h1', {}, 'More'),
    h('div', { class: 'stat' }, h('div', { class: 'card' }, h('b', {}, String(lessons)), h('span', { class: 'muted small' }, 'lessons started')), h('div', { class: 'card' }, h('b', {}, String(solved)), h('span', { class: 'muted small' }, 'problems solved')), h('div', { class: 'card' }, h('b', {}, navigator.onLine ? 'On' : 'Off'), h('span', { class: 'muted small' }, 'internet'))),
    h('h2', {}, 'Install on your phone'),
    installHelp(),
    h('h2', {}, 'Get the full app'),
    h('p', { class: 'muted' }, 'The desktop app adds full C and C++, Java and TypeScript, video courses with a narrator, contests with live boards, awards and certificates.'),
    h('a', { class: 'btn primary', href: '../#download' }, 'Download for Windows, Mac or Linux'),
    h('h2', {}, 'Offline'),
    h('p', { class: 'muted' }, 'Pages you open are saved on the phone. To keep every course and problem for offline use, download them once:'),
    h('button', { class: 'btn', onclick: downloadAll }, 'Save everything for offline'),
    h('p', { class: 'muted small', style: 'margin-top:24px' }, 'Averroes Code · Created by YEASIN ARAFAT'));
}
function installHelp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return h('div', { class: 'card' }, h('ol', { class: 'steps' }, ...(ios
    ? [h('li', {}, 'Open this page in Safari.'), h('li', {}, 'Tap the Share button (square with an arrow).'), h('li', {}, 'Tap ', h('b', {}, 'Add to Home Screen'), ', then ', h('b', {}, 'Add'), '.')]
    : [h('li', {}, 'Open this page in Chrome.'), h('li', {}, 'Tap ', h('b', {}, 'Install app'), ' at the top, or the ⋮ menu → ', h('b', {}, 'Install app'), ' / ', h('b', {}, 'Add to Home screen'), '.'), h('li', {}, 'Open Averroes Code from your home screen. It works without internet.')])));
}
async function downloadAll() {
  const btns = document.querySelectorAll('button');
  btns.forEach((b) => { b.disabled = true; });
  toast('Saving courses and problems…', 4000);
  try {
    const [courses, problems] = await Promise.all([data('courses/index.json'), data('practice/index.json')]);
    const urls = [...courses.flatMap((c) => [`courses/${c.id}.json`, ...(c.languages.includes('bn') ? [`courses/bn/${c.id}.json`] : [])]), ...problems.flatMap((p) => [`practice/p/${p.id}.json`, `practice/t/${p.id}.json`])];
    let n = 0;
    for (let i = 0; i < urls.length; i += 8) await Promise.all(urls.slice(i, i + 8).map((u) => data(u).then(() => n++).catch(() => {})));
    worker('python');
    toast(`Saved ${n} files. Python finishes downloading in the background.`, 4000);
  } finally { btns.forEach((b) => { b.disabled = false; }); }
}

// ---------- navigation ----------
async function go(tab, route) {
  state.tab = tab; store.set('tab', tab);
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab !== 'learn') stopSpeaking();
  let node;
  try {
    node = tab === 'code' ? codeTab() : tab === 'learn' ? await learnTab(route === undefined ? undefined : route) : tab === 'practice' ? await practiceTab(route === undefined ? undefined : route) : moreTab();
  } catch (e) {
    node = h('div', {}, h('h1', {}, 'Not available offline yet'), h('p', { class: 'muted' }, e.message), h('button', { class: 'btn', onclick: () => go(tab, null) }, 'Back'));
  }
  $view.replaceChildren(node);
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab, b.dataset.tab === state.tab ? null : undefined)));

// Online / offline badge and the install button.
const net = document.getElementById('net');
const paintNet = () => { net.textContent = navigator.onLine ? 'Online' : 'Offline'; net.classList.toggle('off', !navigator.onLine); };
addEventListener('online', paintNet); addEventListener('offline', paintNet); paintNet();
let installEvent = null;
const installBtn = document.getElementById('install');
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; installBtn.classList.remove('hidden'); });
installBtn.addEventListener('click', async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; installBtn.classList.add('hidden'); });
addEventListener('appinstalled', () => installBtn.classList.add('hidden'));
if (!matchMedia('(display-mode: standalone)').matches && /iphone|ipad|ipod/i.test(navigator.userAgent) && !store.get('iosHint', false)) {
  store.set('iosHint', true);
  setTimeout(() => sheet(h('h2', {}, 'Install Averroes Code'), installHelp(), h('button', { class: 'btn primary', style: 'margin-top:12px;width:100%', onclick: closeSheet }, 'OK')), 1200);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

go(state.tab);
