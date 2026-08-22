import http from "node:http";

const upstream = process.env.SUBGRAPH_UPSTREAM_URL ?? "";
const apiKey = process.env.SUBGRAPH_API_KEY ?? "";
const port = Number(process.env.PORT ?? 8080);
const maxBody = 1_000_000;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "access-control-allow-origin": "*", ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204, "", {
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    });
  }

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, JSON.stringify({ ok: true, upstreamConfigured: upstream.length > 0 }), {
      "content-type": "application/json"
    });
  }

  if (req.method === "POST" && (req.url === "/" || req.url === "/graphql")) {
    if (!upstream) {
      return send(res, 503, JSON.stringify({ error: "SUBGRAPH_UPSTREAM_URL not configured" }), {
        "content-type": "application/json"
      });
    }

    let payload = "";
    try {
      for await (const chunk of req) {
        payload += chunk;
        if (payload.length > maxBody) {
          req.destroy();
          return send(res, 413, JSON.stringify({ error: "payload too large" }), { "content-type": "application/json" });
        }
      }
    } catch {
      return send(res, 400, JSON.stringify({ error: "failed to read request body" }), { "content-type": "application/json" });
    }

    const headers = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    try {
      const upstreamResponse = await fetch(upstream, { method: "POST", headers, body: payload });
      const text = await upstreamResponse.text();
      return send(res, upstreamResponse.status, text, {
        "content-type": upstreamResponse.headers.get("content-type") ?? "application/json"
      });
    } catch {
      return send(res, 502, JSON.stringify({ error: "subgraph upstream unavailable" }), {
        "content-type": "application/json"
      });
    }
  }

  send(res, 404, JSON.stringify({ error: "not found" }), { "content-type": "application/json" });
});

server.listen(port, () => {
  console.log(`narrative indexer listening on :${port} (upstream ${upstream ? "configured" : "missing"})`);
});
