// منصة تقييم التعليم الأخضر — نقطة التشغيل
import { handleApi } from "./src/api.ts";
import { kvError, seedIfEmpty } from "./src/db.ts";

let bootError: string | null = kvError;
if (!bootError) {
  try {
    const res = await seedIfEmpty();
    if (res.seeded) console.log(`تهيئة أولى: ${res.accounts} حساباً · ${res.inst} مؤسسة`);
  } catch (e) {
    bootError = e instanceof Error ? e.message : String(e);
    console.error("[خطأ] فشلت التهيئة:", bootError);
  }
}

function diagnosticPage(msg: string): Response {
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>المنصة غير جاهزة</title>
<style>body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f7f4;color:#20302a;
line-height:1.9;margin:0;padding:24px}.b{max-width:760px;margin:32px auto;background:#fff;
border-radius:16px;padding:28px 30px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:21px;color:#0F5132}.e{background:#FCEBEB;border-right:5px solid #C0392B;color:#8a2a1e;
border-radius:10px;padding:13px 16px;margin:16px 0;font-family:Consolas,monospace;font-size:13px;
direction:ltr;text-align:left;overflow-x:auto}
ol{margin:12px 22px 0 0}li{margin-bottom:9px}code{background:#EAF3DE;color:#0F5132;
padding:1px 7px;border-radius:5px;font-family:Consolas,monospace}</style></head><body><div class="b">
<h1>المنصة لم تُقلع — قاعدة البيانات غير متصلة</h1>
<p>تعذّر على التطبيق فتح قاعدة بيانات Deno KV، ولذلك لم تبدأ المنصة.</p>
<div class="e">${msg.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</div>
<p><b>الحل على Deno Deploy:</b></p>
<ol>
<li>من لوحة المنظمة في <code>console.deno.com</code> افتح <b>Databases</b>.</li>
<li>اضغط <b>Provision Database</b> واختر المحرك <b>Deno KV</b> وسمّها ثم احفظ.</li>
<li>اضغط <b>Assign</b> أمام القاعدة واختر هذا التطبيق.</li>
<li>انتظر حتى تصير الحالة <b>Connected</b>، ثم <b>Redeploy</b>.</li>
</ol>
<p><b>محلياً:</b> شغّل بـ <code>deno task start</code> لأن الإعداد <code>unstable: ["kv"]</code>
مضبوط في <code>deno.json</code>.</p>
<p style="color:#5f6b64;font-size:13px">التفصيل في ملف <code>دليل_النشر_من_المتصفح.md</code>.</p>
</div></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
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
    return new Response(
      JSON.stringify({ ok: !bootError, error: bootError, at: new Date().toISOString() }),
      { status: bootError ? 503 : 200, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  // قاعدة البيانات غير متاحة: اعرض تشخيصاً مفهوماً بدل خطأ غامض
  if (bootError) return diagnosticPage(bootError);

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
