# Python in the Code node: findings (task 6.3)

**Decision: not implemented.** Pyodide runs in our runtime, and its time
and memory can be limited, but it cannot be kept away from the network and
the filesystem, which the task requires. It is also about 60 times slower
to start than QuickJS. The Code node stays JavaScript only.

Tested on 2026-10-12 with `pyodide@314.0.7` (Python 3.14) on Node 22.11,
Windows, Intel i5-1035G1, 8 GB RAM. Nothing was measured on Vercel itself:
the timings below are from a slow laptop and will be lower there, the
conclusions about isolation do not depend on the machine.

## What was measured

Each number is from a new Node process (a cold start), five runs.

| | Pyodide | QuickJS (today) |
|---|---|---|
| Cold start: import, start the engine, run one line | 4.7 to 5.9 s | 0.08 to 0.09 s |
| A new engine in a process that is already warm | 3.8 to 6 s | 0.01 to 0.04 s |
| Memory of the process after one engine (RSS) | 27 MB → 110 MB (+83 MB) | +11 MB |
| WebAssembly memory of an idle engine | 30 MB | 16 MB |
| Each further engine in the same process | about +43 MB | given back |
| After 12 engines and a garbage collection | 215 to 250 MB | no growth seen |
| Files to deploy | 13.9 MB (wasm 9.6, standard library 2.5, loader 1.3) | already deployed |

The Code node gives every run an engine of its own, so that one run cannot
see or exhaust another's memory. With Pyodide that means the "warm" row,
4 to 6 seconds here, is paid by **every** run of a Python Code node, also
inside a Loop. The Code node's default time limit is 10 seconds.

Keeping one Pyodide engine alive between runs would remove most of that
time, but runs of different users would then share one Python interpreter
(modules, globals, files in its virtual disk), which is not acceptable.

## Serverless limits

| Limit (Vercel Functions, from Vercel's documentation) | Value | Pyodide |
|---|---|---|
| Function size, uncompressed | 250 MB | fits: 13.9 MB |
| Memory | 2 GB on Hobby, 4 GB on Pro | fits: about 85 MB per engine, plus the script's own |
| Duration | 300 s (our `/api/inngest` route sets `maxDuration = 300`) | fits, but 4 to 6 s of each run is start-up |
| Worker threads | available in the Node.js runtime | needed, see below |

So size, memory and duration are not what rules it out.

## Can it be limited like QuickJS?

Tried with the strictest set-up Pyodide offers: Python in a
`worker_threads` worker with an empty `process.env`, an empty object as
Python's `js` module (`jsglobals: {}`), a guard on WebAssembly memory
growth, and `worker.terminate()` as the timeout.

| Requirement | Result |
|---|---|
| Time limit | **Works**, only by terminating the worker. `while True: pass` and a loop that catches every exception were both stopped. Pyodide's own interrupt is a `KeyboardInterrupt`, which a script can catch, so it is not enough. |
| Memory limit | **Works for honest code.** With growth capped at 64 MB over the engine's 30 MB, a script that allocates 200 MB got a Python `MemoryError` at 90 MB. A script that escapes to JavaScript (below) can remove the guard. |
| No filesystem | **Fails.** Plain Python only sees Pyodide's virtual disk (`/tmp`, `/home`, `/lib`), and `open("C:/Windows/win.ini")` is "No such file". But see below. |
| No network | **Fails.** `urllib` over HTTPS fails ("TLS not supported"). `socket.create_connection` reported "connected" but no data came back in the test; not relied on either way. But see below. |
| No secrets | `os.environ` holds only Pyodide's own values. But see below. |

### Why filesystem and network cannot be closed

Pyodide is built to let Python call JavaScript. Emptying the `js` module
does not remove that bridge: Pyodide's own `pyodide_js` module hands
Python a JavaScript object, and from any JavaScript object the `Function`
constructor is two attribute reads away. Code built with it runs in the
worker's JavaScript, outside Python, with everything Node gives a thread.

From a Python script in the locked-down worker described above, all of
these succeeded:

| From Python, through that bridge | Result |
|---|---|
| Read a file of the host (`node:fs`) | read `C:\Windows\win.ini` |
| See the project's `.env` | `existsSync` returned true (the file was not read) |
| Network request (`fetch`) | `https://example.com` answered 200 |
| Run a command on the host (`node:child_process`) | `echo` ran |
| Reach `WebAssembly.Memory.prototype` | reachable, so the memory guard can be undone |

Removing `pyodide_js` from Python does not help: CPython is not a
sandbox, and a module that is compiled into the interpreter can be found
again from inside it. Removing `fetch`, `process` and the like from the
worker is a list of things to forbid, and JavaScript's `import()` cannot
be removed that way. Node 22 has no switch that takes the network away
from a thread.

QuickJS is different in kind: the script runs in an engine that has no
bridge to the host at all, only the two functions we put there.

This is the same weakness n8n had. Its Python Code node ran on Pyodide
until version 2.0; CVE-2025-68668 (rated 9.9) is a sandbox bypass in
exactly that node that let a workflow author run commands on the server.
n8n's answer was to move Python out of the main process into separate
task runners.

## If Python is wanted later

Not evaluated in this task; each is a task of its own.

* **A separate runner**, as n8n does now: Python in a process or
  container of its own with no network and a read-only filesystem. Needs
  somewhere to run it: Vercel functions cannot start one.
* **A hosted code sandbox** (a per-run micro-VM service). Isolation is the
  provider's job; costs money per run and needs an account and a key.
* **CPython built for WASI**, run without any JavaScript bridge. WASI has
  no way to open a network connection, and the filesystem is only what is
  handed in. Start-up time, the memory limit and Node's support for it
  would have to be measured first.

## How to repeat the test

In an empty folder: `npm install pyodide@314.0.7`, then

* time `const { loadPyodide } = await import("pyodide"); const py = await
  loadPyodide(); py.runPython("1+1")` in a new `node` process, with
  `process.memoryUsage()` before and after;
* run a script in a `Worker` started with `env: {}` and
  `loadPyodide({ jsglobals: {} })`, and from Python look at what
  `pyodide_js` gives access to.
