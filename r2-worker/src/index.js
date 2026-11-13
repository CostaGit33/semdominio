const ALLOWED_KEY = /^(jogadores|goleiros)\/[1-9][0-9]*\.(jpg|png|webp|gif)$/;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function bytesFromHex(hex) {
  if (!/^[a-f0-9]{64}$/i.test(hex || "")) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifySignature(key, exp, signature, secret) {
  const supplied = bytesFromHex(signature);
  if (!supplied) return false;
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  const data = new TextEncoder().encode(`${key}:${exp}`);
  return crypto.subtle.verify("HMAC", cryptoKey, supplied, data);
}

function safeKey(value) {
  if (typeof value !== "string" || value.length > 180 || !ALLOWED_KEY.test(value)) return false;
  return !value.includes("..") && !value.includes("//");
}

function decodePrivateKey(pathname) {
  const prefix = "/private/";
  if (!pathname.startsWith(prefix)) return null;
  try {
    const key = pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    return safeKey(key) ? key : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      const configured = Boolean(env.IMAGES && env.R2_INTERNAL_TOKEN && env.R2_SIGNING_SECRET);
      return json({
        status: configured ? "ok" : "degraded",
        storage: env.IMAGES ? "private-r2" : "not_bound",
        credentials: env.R2_INTERNAL_TOKEN && env.R2_SIGNING_SECRET ? "configured" : "missing"
      }, configured ? 200 : 503);
    }

    if (url.pathname === "/internal/objects") {
      if (!env.R2_INTERNAL_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.R2_INTERNAL_TOKEN}`) {
        return json({ error: "Não autorizado" }, 401);
      }
      const key = url.searchParams.get("key");
      if (!safeKey(key)) return json({ error: "Chave inválida" }, 400);

      if (request.method === "PUT") {
        const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED_TYPES.has(contentType)) return json({ error: "Tipo de imagem não permitido" }, 415);
        const declaredLength = Number(request.headers.get("Content-Length") || 0);
        if (declaredLength > MAX_BYTES) return json({ error: "Imagem excede 5 MB" }, 413);
        const body = await request.arrayBuffer();
        if (!body.byteLength || body.byteLength > MAX_BYTES) return json({ error: "Tamanho de imagem inválido" }, 413);
        await env.IMAGES.put(key, body, {
          httpMetadata: { contentType, cacheControl: "private, no-store" },
          customMetadata: { uploadedAt: new Date().toISOString() }
        });
        return json({ success: true, key });
      }

      if (request.method === "DELETE") {
        await env.IMAGES.delete(key);
        return json({ success: true, key });
      }

      return json({ error: "Método não permitido" }, 405);
    }

    if (url.pathname.startsWith("/private/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json({ error: "Método não permitido" }, 405);
      }
      const key = decodePrivateKey(url.pathname);
      if (!key) return json({ error: "Imagem não encontrada" }, 404);
      const expText = url.searchParams.get("exp") || "";
      const signature = url.searchParams.get("sig") || "";
      if (!/^[0-9]{10}$/.test(expText)) return json({ error: "Assinatura inválida" }, 403);
      const exp = Number(expText);
      const now = Math.floor(Date.now() / 1000);
      if (exp < now || exp > now + 3600) return json({ error: "URL expirada ou validade inválida" }, 403);
      if (!env.R2_SIGNING_SECRET || !(await verifySignature(key, expText, signature, env.R2_SIGNING_SECRET))) {
        return json({ error: "Assinatura inválida" }, 403);
      }

      const object = await env.IMAGES.get(key);
      if (!object) return json({ error: "Imagem não encontrada" }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      if (request.method === "HEAD") return new Response(null, { headers });
      return new Response(object.body, { headers });
    }

    return json({ error: "Não encontrado" }, 404);
  }
};
