#!/usr/bin/env python3
"""Install the AI Workbench Config Sync nginx location block."""

from __future__ import annotations

from pathlib import Path


NGINX_CONF = Path("/etc/nginx/nginx.conf")
MARKER = "        location = /.well-known/apple-app-site-association {"
LOCATION_BLOCK = """        location = /aiwb-config-sync {
            return 308 /aiwb-config-sync/;
        }

        location ^~ /aiwb-config-sync/ {
            add_header Access-Control-Allow-Origin '*' always;
            add_header Access-Control-Allow-Headers 'Authorization,Content-Type' always;
            add_header Access-Control-Allow-Methods 'GET,POST,PUT,DELETE,OPTIONS' always;
            proxy_hide_header Access-Control-Allow-Origin;
            proxy_hide_header Access-Control-Allow-Headers;
            proxy_hide_header Access-Control-Allow-Methods;
            if ($request_method = 'OPTIONS') {
                return 204;
            }
            rewrite ^/aiwb-config-sync/?(.*)$ /$1 break;
            proxy_pass http://127.0.0.1:18088;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 30s;
            proxy_send_timeout 30s;
        }

"""


def main() -> int:
    text = NGINX_CONF.read_text("utf-8")
    if "location ^~ /aiwb-config-sync/" in text:
        print("aiwb nginx proxy already installed")
        return 0
    if MARKER not in text:
        raise SystemExit("nginx marker not found")
    backup = NGINX_CONF.with_suffix(".conf.aiwb-config-sync.bak")
    backup.write_text(text, "utf-8")
    NGINX_CONF.write_text(text.replace(MARKER, LOCATION_BLOCK + MARKER, 1), "utf-8")
    print(f"installed aiwb nginx proxy; backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
