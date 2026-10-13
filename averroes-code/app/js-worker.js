// Runs JavaScript in its own thread with Node-style input/output, so practice
// solutions written for Node (fs.readFileSync(0), readline) work on a phone.
let out = '';
let err = '';
const fmt = (a) => a.map((x) => (typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ');
self.onmessage = (e) => {
  const { code, stdin = '' } = e.data;
  out = ''; err = '';
  const t0 = performance.now();
  let pending = 0;
  const realTimeout = self.setTimeout.bind(self);
  const finish = () => self.postMessage({ out, err, ms: Math.round(performance.now() - t0) });
  const settle = () => realTimeout(() => (pending > 0 ? settle() : finish()), 0);
  const console = { log: (...a) => { out += `${fmt(a)}\n`; }, info: (...a) => { out += `${fmt(a)}\n`; }, warn: (...a) => { err += `${fmt(a)}\n`; }, error: (...a) => { err += `${fmt(a)}\n`; } };
  const process = { stdout: { write: (s) => { out += String(s); return true; } }, stderr: { write: (s) => { err += String(s); return true; } }, argv: [], env: {}, exit: () => { throw { __exit: true }; }, stdin: { on() {}, setEncoding() {}, resume() {} } };
  const lines = stdin.replace(/\r/g, '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const readline = {
    createInterface() {
      const handlers = {};
      const rl = {
        on(ev, fn) { handlers[ev] = fn; return rl; },
        close() {},
        question(q, fn) { out += q; realTimeout(() => fn(lines.shift() ?? ''), 0); },
        [Symbol.asyncIterator]: async function* () { for (const l of lines) yield l; },
      };
      pending++;
      realTimeout(() => { try { for (const l of lines) handlers.line && handlers.line(l); handlers.close && handlers.close(); } catch (x) { report(x); } pending--; }, 0);
      return rl;
    },
  };
  const fs = { readFileSync: () => stdin };
  const require = (m) => { if (m === 'fs') return fs; if (m === 'readline') return readline; throw new Error(`Module "${m}" is not available on the phone.`); };
  const prompt = () => lines.shift() ?? null;
  function report(x) { if (x && x.__exit) return; err += `${x && x.stack ? x.stack.split('\n').slice(0, 3).join('\n') : x}\n`; }
  const setTimeout = (fn, ms) => { pending++; return realTimeout(() => { pending--; try { fn(); } catch (x) { report(x); } }, ms); };
  try {
    // eslint-disable-next-line no-new-func
    new Function('console', 'process', 'require', 'prompt', 'setTimeout', 'module', 'exports', code)(console, process, require, prompt, setTimeout, {}, {});
  } catch (x) { report(x); }
  settle();
};
