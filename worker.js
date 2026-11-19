// CS2 $20 Draft: serves the game page and the online rooms (Cloudflare Workers + Durable Objects).
import { DurableObject } from "cloudflare:workers";
import html from "./index.html";

const MAX_PEERS = 4;
const MAX_MSG_BYTES = 32768;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      }
      const code = (url.searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 4) return new Response("Bad room code", { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    return new Response("Not found", { status: 404 });
  },
};

export class DraftRoom extends DurableObject {
  async fetch(request) {
    const open = this.ctx.getWebSockets();
    if (open.length >= MAX_PEERS) {
      try { open[0].close(4000, "replaced"); } catch (e) {}
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > MAX_MSG_BYTES) return;
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === ws) continue;
      try { peer.send(message); } catch (e) {}
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000, "bye"); } catch (e) {}
  }

  async webSocketError(ws) {
    try { ws.close(1011, "error"); } catch (e) {}
  }
}
