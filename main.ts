// منصة تقييم التعليم الأخضر — نقطة التشغيل
import { handleApi } from "./src/api.ts";
import { seedIfEmpty } from "./src/db.ts";

const res = await seedIfEmpty();
if (res.seeded) console.log(`تهيئة أولى: ${res.accounts} حساباً · ${res.inst} مؤسسة`);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const SEC_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
};

async function serveStatic(path: string): Promise<Response | null> {
  const clean = path.replace(/\.\./g, "").replace(/^\/+/, "");
  const file = clean === "" ? "index.html" : clean;
  try {
    const data = await Deno.readFile(new URL(`./static/${file}`, import.meta.url));
    const ext = file.slice(file.lastIndexOf("."));
    return new Response(data, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream", ...SEC_HEADERS },
    });
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const secure = url.protocol === "https:";

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const api = await handleApi(req, url, secure);
  if (api) {
    for (const [k, v] of Object.entries(SEC_HEADERS)) api.headers.set(k, v);
    return api;
  }

  const st = await serveStatic(url.pathname);
  if (st) return st;

  // أي مسار آخر يعود للواجهة
  const idx = await serveStatic("/index.html");
  if (idx) return idx;
  return new Response("غير موجود", { status: 404 });
});
