// Python on the phone with Pyodide (downloaded once, then kept offline).
importScripts('pyodide/pyodide.js');
let py = null;
const ready = (async () => { py = await loadPyodide({ indexURL: new URL('pyodide/', self.location.href).href }); self.postMessage({ ready: true }); })()
  .catch((e) => self.postMessage({ ready: false, error: String(e) }));
self.onmessage = async (e) => {
  await ready;
  if (!py) return self.postMessage({ out: '', err: 'Python could not load. Connect to the internet once so it can download.', ms: 0 });
  const { code, stdin = '' } = e.data;
  const lines = stdin.replace(/\r/g, '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let out = ''; let err = '';
  py.setStdin({ stdin: () => (lines.length ? lines.shift() : undefined) });
  py.setStdout({ batched: (s) => { out += `${s}\n`; } });
  py.setStderr({ batched: (s) => { err += `${s}\n`; } });
  const t0 = performance.now();
  const ns = py.globals.get('dict')();
  try {
    await py.runPythonAsync(code, { globals: ns });
  } catch (x) {
    const msg = String(x.message || x);
    // Keep only the part of the traceback that points into the user's code.
    const all = msg.split('\n');
    const start = all.findIndex((l) => l.includes('File "<exec>"'));
    const tb = (start >= 0 ? all.slice(start) : all.filter((l) => !/^\s*File "\/lib\/|_pyodide|pyodide\/|^Traceback/.test(l)))
      .map((l) => l.replace(/File "<exec>", line (\d+), in <module>/, 'Line $1'));
    err += `${tb.join('\n').trim()}\n`;
    if (/EOFError/.test(msg)) err += 'Tip: your program asked for input. Type it in the Input box (one value per line) and press Run again.\n';
  } finally { ns.destroy(); }
  self.postMessage({ out, err, ms: Math.round(performance.now() - t0) });
};
