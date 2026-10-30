"""A stand-in for an agent's access, with three ways to revoke it. Standard library only.

  python3 mock_server.py [port] [token_lifetime_seconds]

Endpoints (all on 127.0.0.1):
  POST /token              issue a token, unless the client is disabled (then 401)
  GET  /api                accept any unexpired token it issued: like a server that
                           checks a JWT's signature and expiry locally, so revoking
                           does nothing until the token expires
  GET  /introspect?token=  200 only while the token is unexpired, not revoked and its
                           client is enabled: like a server that asks the identity
                           provider on every call
  GET  /gateway            200 until the gateway rule is removed
  POST /admin/disable-client, /admin/revoke?token=, /admin/gateway-off   the levers
"""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
LIFETIME = float(sys.argv[2]) if len(sys.argv) > 2 else 6.0
state = {"client_enabled": True, "gateway": True, "tokens": {}, "revoked": set(), "n": 0}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, body=None):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body or {}).encode())

    def bearer(self):
        h = self.headers.get("Authorization", "")
        return h[7:] if h.startswith("Bearer ") else ""

    def live(self, tok):
        return tok in state["tokens"] and state["tokens"][tok] > time.time()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/token":
            if not state["client_enabled"]:
                return self.reply(401, {"error": "client disabled"})
            state["n"] += 1
            tok = f"tok-{state['n']}"
            state["tokens"][tok] = time.time() + LIFETIME
            return self.reply(200, {"access_token": tok, "expires_in": LIFETIME})
        if u.path == "/admin/disable-client":
            state["client_enabled"] = False
            return self.reply(204)
        if u.path == "/admin/revoke":
            state["revoked"].add(parse_qs(u.query).get("token", [""])[0])
            return self.reply(204)
        if u.path == "/admin/gateway-off":
            state["gateway"] = False
            return self.reply(204)
        self.reply(404)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api":
            return self.reply(200 if self.live(self.bearer()) else 401)
        if u.path == "/introspect":
            tok = parse_qs(u.query).get("token", [""])[0]
            ok = self.live(tok) and tok not in state["revoked"] and state["client_enabled"]
            return self.reply(200 if ok else 401, {"active": ok})
        if u.path == "/gateway":
            return self.reply(200 if state["gateway"] else 403)
        self.reply(404)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
