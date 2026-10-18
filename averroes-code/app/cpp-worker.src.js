// Runs C and C++ on the phone with JSCPP, a C++ interpreter written in
// JavaScript (no server, works offline). It covers beginner programs:
// iostream, cstdio, cmath, cstring, cstdlib, iomanip, arrays and functions.
const JSCPP = require('JSCPP');
self.onmessage = (e) => {
  const { code, stdin = '' } = e.data;
  let out = '';
  const t0 = performance.now();
  let err = '';
  try {
    const exit = JSCPP.run(code, stdin, { stdio: { write: (s) => { out += s; } }, unsigned_overflow: 'ignore' });
    if (exit) err = `Program ended with code ${exit}\n`;
  } catch (x) {
    const msg = String((x && x.message) || x);
    const lib = /cannot find library: (\w+)/.exec(msg);
    if (/you must return a value/.test(msg)) { /* main() without return 0: fine */ } else if (lib) {
      err = `<${lib[1]}> is not available on the phone yet. The phone supports iostream, cstdio, cmath, cstring, cstdlib, ctime and iomanip. Use the desktop app for ${lib[1]}.\n`;
    } else err = `${msg}\n`;
  }
  self.postMessage({ out, err, ms: Math.round(performance.now() - t0) });
};
