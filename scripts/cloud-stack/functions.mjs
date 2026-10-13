/* global Deno */
// -----------------------------------------------------------------------------
// Edge Functions im Cloud-Stack (scripts/cloud-stack.sh) - laeuft in Deno.
//
// Die Edge Runtime von Supabase gibt es nur als Container-Image. Die
// Functions unter supabase/functions/ brauchen von ihr aber nur zwei Dinge:
// `Deno.env.get` und `Deno.serve` (supabase/functions/deno.d.ts). Dieser
// Router laedt jede Function einmal, faengt dabei ihren Aufruf von
// `Deno.serve` ab und bedient alle unter einem Port:
//
//   http://127.0.0.1:<port>/<function>/...  ->  Handler der Function
//
// Das Gateway leitet /functions/v1/<function> hierher weiter und prueft
// vorher `verify_jwt` aus supabase/config.toml - wie die Edge Runtime.
//
// Die Secrets der Functions kommen aus der Umgebung, die cloud-stack.sh
// setzt (SUPABASE_URL, SUPABASE_ANON_KEY, ... und auf Wunsch
// supabase/functions/.env.local). Protokolliert wird nur, was schiefging,
// ohne Inhalt einer Anfrage (ADR-011).
// -----------------------------------------------------------------------------
const port = Number(Deno.args[0] ?? '54338');
const functionsDir = new URL('../../supabase/functions/', import.meta.url);

const handlers = new Map();
const failures = new Map();
const realServe = Deno.serve.bind(Deno);
let loading = null;

function captureServe(...args) {
  const handler =
    args.find((argument) => typeof argument === 'function') ?? args[0]?.handler ?? null;
  if (loading && typeof handler === 'function') handlers.set(loading, handler);
  return {
    finished: new Promise(() => undefined),
    shutdown: () => Promise.resolve(),
    ref: () => undefined,
    unref: () => undefined,
    addr: { hostname: '127.0.0.1', port, transport: 'tcp' },
  };
}

Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: captureServe });

const names = [];
for (const entry of Deno.readDirSync(functionsDir)) {
  if (!entry.isDirectory) continue;
  try {
    Deno.statSync(new URL(`${entry.name}/index.ts`, functionsDir));
  } catch {
    continue;
  }
  names.push(entry.name);
}
names.sort();

for (const name of names) {
  loading = name;
  try {
    await import(new URL(`${name}/index.ts`, functionsDir).href);
    if (!handlers.has(name)) failures.set(name, 'kein Aufruf von Deno.serve');
  } catch (cause) {
    failures.set(name, cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
  }
}
loading = null;
Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: realServe });

for (const [name, reason] of failures) {
  console.error(`Funktionen: ${name} nicht geladen - ${reason}`);
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

realServe(
  {
    hostname: '127.0.0.1',
    port,
    onListen: () =>
      console.error(`Funktionen: ${[...handlers.keys()].join(', ') || 'keine'} auf Port ${port}`),
  },
  async (request, info) => {
    const name = new URL(request.url).pathname.split('/').filter(Boolean)[0] ?? '';
    if (name === '' && request.method === 'GET') {
      return json(200, { functions: [...handlers.keys()], failed: [...failures.keys()] });
    }
    const handler = handlers.get(name);
    if (!handler) {
      return json(404, {
        code: 'NOT_FOUND',
        message: failures.has(name)
          ? `Cloud-Stack: Function ${name} liess sich nicht laden (Log: .tmp/stack/functions.log).`
          : `Cloud-Stack: Function ${name} gibt es nicht.`,
      });
    }
    try {
      return await handler(request, info);
    } catch (cause) {
      console.error(
        `Funktionen: ${name} brach ab (${cause instanceof Error ? cause.name : 'unbekannt'})`,
      );
      return json(500, { code: 'WORKER_ERROR', message: 'Function failed' });
    }
  },
);
