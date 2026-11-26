"""Tiny demo service that exposes Prometheus metrics on 127.0.0.1:9200.

It stands in for a real application. Stopping it triggers the ServiceDown alert.
"""
import random
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

START = time.time()
requests_total = 0


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global requests_total
        requests_total += random.randint(1, 20)
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return
        body = (
            "# TYPE shop_up gauge\nshop_up 1\n"
            "# TYPE shop_requests_total counter\n"
            f"shop_requests_total {requests_total}\n"
            "# TYPE shop_uptime_seconds gauge\n"
            f"shop_uptime_seconds {time.time() - START:.0f}\n"
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


HTTPServer(("127.0.0.1", 9200), Handler).serve_forever()
