#!/usr/bin/env python3
"""AI Workbench lightweight configuration sync service.

This service stores account-scoped configuration blobs for AI Workbench.
The recommended client contract is to encrypt the actual workspace config on
the client, then upload the encrypted blob here. The service only validates the
sync account password and keeps opaque payload revisions.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import signal
import sys
import threading
import time
import unicodedata
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


APP_NAME = "AI Workbench Config Sync"
SERVICE_VERSION = 3
MAX_BODY_BYTES = int(os.environ.get("AIWB_CONFIG_SYNC_MAX_BODY_BYTES", str(2 * 1024 * 1024)))
DATA_DIR = Path(os.environ.get("AIWB_CONFIG_SYNC_DATA_DIR", "/opt/ai-workbench-config-sync/data"))
HOST = os.environ.get("AIWB_CONFIG_SYNC_HOST", "0.0.0.0")
PORT = int(os.environ.get("AIWB_CONFIG_SYNC_PORT", "18088"))
TOKEN_TTL_SECONDS = int(os.environ.get("AIWB_CONFIG_SYNC_TOKEN_TTL_SECONDS", str(7 * 24 * 60 * 60)))
PBKDF2_ITERATIONS = int(os.environ.get("AIWB_CONFIG_SYNC_PBKDF2_ITERATIONS", "260000"))
ACCOUNT_PATTERN = re.compile(r"^[a-zA-Z0-9_.@+-]{2,96}$")


STATE_LOCK = threading.RLock()
TOKENS: dict[str, dict[str, Any]] = {}
SHOULD_EXIT = threading.Event()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def json_dumps(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def account_key(account: str) -> str:
    normalized = normalize_account(account)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def normalize_account(account: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(account or ""))
    return re.sub(r"[\u200b-\u200d\ufeff]", "", normalized).strip().lower()


def account_dir(account: str) -> Path:
    return DATA_DIR / "accounts" / account_key(account)


def safe_mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    try:
        path.chmod(0o700)
    except OSError:
        pass


def atomic_write_json(path: Path, value: Any) -> None:
    safe_mkdir(path.parent)
    tmp_path = path.with_name(f".{path.name}.{secrets.token_hex(6)}.tmp")
    tmp_path.write_bytes(json_dumps(value))
    try:
        tmp_path.chmod(0o600)
    except OSError:
        pass
    tmp_path.replace(path)


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text("utf-8"))


def password_hash(password: str, salt_hex: str | None = None) -> dict[str, Any]:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return {
        "algorithm": "pbkdf2-sha256",
        "iterations": PBKDF2_ITERATIONS,
        "salt": salt.hex(),
        "hash": derived.hex(),
    }


def verify_password(password: str, record: dict[str, Any]) -> bool:
    if record.get("algorithm") != "pbkdf2-sha256":
        return False
    iterations = int(record.get("iterations") or PBKDF2_ITERATIONS)
    salt = bytes.fromhex(str(record.get("salt") or ""))
    expected = bytes.fromhex(str(record.get("hash") or ""))
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def validate_account_password(account: str, password: str) -> tuple[bool, str]:
    normalized = normalize_account(account)
    if not ACCOUNT_PATTERN.match(normalized):
        return False, "同步账号只能包含字母、数字、点、下划线、@、+ 和 -，长度 2-96。"
    if not str(password or ""):
        return False, "请填写同步密码。"
    return True, ""


def account_record_path(account: str) -> Path:
    return account_dir(account) / "account.json"


def config_record_path(account: str) -> Path:
    return account_dir(account) / "config.json"


def shares_incoming_path(account: str) -> Path:
    return account_dir(account) / "shares-incoming.json"


def shares_outgoing_path(account: str) -> Path:
    return account_dir(account) / "shares-outgoing.json"


def events_path(account: str) -> Path:
    return account_dir(account) / "events.ndjson"


def append_event(account: str, event: str, fields: dict[str, Any] | None = None) -> None:
    fields = fields or {}
    safe_fields = {
        key: value
        for key, value in fields.items()
        if key not in {"password", "payload", "encryptedPayload", "config", "secret", "token"}
    }
    line = json_dumps({"time": utc_now(), "event": event, **safe_fields}).decode("utf-8") + "\n"
    path = events_path(account)
    safe_mkdir(path.parent)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(line)


def read_events(account: str, limit: int = 50) -> list[dict[str, Any]]:
    path = events_path(account)
    if not path.exists():
        return []
    try:
        lines = path.read_text("utf-8").splitlines()[-max(1, min(limit, 200)) :]
        return [json.loads(line) for line in lines if line.strip()]
    except Exception:
        return []


def read_share_records(path: Path) -> list[dict[str, Any]]:
    value = read_json(path, [])
    return [item for item in value if isinstance(item, dict) and str(item.get("id") or "").strip()]


def upsert_share_record(path: Path, record: dict[str, Any]) -> list[dict[str, Any]]:
    records = read_share_records(path)
    identity = (
        str(record.get("ownerAccount") or ""),
        str(record.get("recipientAccount") or ""),
        str(record.get("sessionKey") or ""),
    )
    next_records = [
        item
        for item in records
        if (
            str(item.get("ownerAccount") or ""),
            str(item.get("recipientAccount") or ""),
            str(item.get("sessionKey") or ""),
        ) != identity
    ]
    next_records.insert(0, record)
    return next_records[:200]


def validate_share_session(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("缺少要分享的会话。")
    encoded = json_dumps(value)
    if len(encoded) > 128 * 1024:
        raise ValueError("会话分享内容过大。")
    profile = value.get("profile") if isinstance(value.get("profile"), dict) else {}
    clean_profile = dict(profile)
    for field in (
        "openAIAPIKey",
        "aliyunApiKey",
        "aliyunWorkspaceId",
    ):
        clean_profile.pop(field, None)
    return {
        "conversationId": str(value.get("conversationId") or value.get("sessionId") or "").strip()[:180],
        "name": str(value.get("name") or "共享会话").strip()[:160],
        "syncKey": str(value.get("syncKey") or "").strip()[:512],
        "profile": clean_profile,
        "permission": "use",
    }


def create_share(account: str, body: dict[str, Any]) -> dict[str, Any]:
    owner = normalize_account(account)
    recipient = normalize_account(body.get("recipientAccount"))
    if not ACCOUNT_PATTERN.match(recipient):
        raise ValueError("接收账号格式不正确。")
    if recipient == owner:
        raise ValueError("不能把会话分享给自己。")
    session = validate_share_session(body.get("session"))
    if not session["conversationId"]:
        raise ValueError("共享会话缺少会话 ID。")

    now = utc_now()
    record = {
        "id": f"share-{secrets.token_urlsafe(18)}",
        "ownerAccount": owner,
        "recipientAccount": recipient,
        "sessionKey": session["syncKey"] or session["conversationId"],
        "permission": "use",
        "createdAt": now,
        "updatedAt": now,
        "session": session,
    }
    with STATE_LOCK:
        outgoing = upsert_share_record(shares_outgoing_path(owner), record)
        incoming = upsert_share_record(shares_incoming_path(recipient), record)
        atomic_write_json(shares_outgoing_path(owner), outgoing)
        atomic_write_json(shares_incoming_path(recipient), incoming)
        append_event(owner, "session.share.created", {"shareId": record["id"], "recipientAccount": recipient})
        append_event(recipient, "session.share.received", {"shareId": record["id"], "ownerAccount": owner})
    return record


def delete_share(account: str, share_id: str) -> bool:
    account = normalize_account(account)
    share_id = str(share_id or "").strip()
    if not share_id:
        raise ValueError("缺少共享 ID。")
    removed = False
    with STATE_LOCK:
        candidates = read_share_records(shares_outgoing_path(account)) + read_share_records(shares_incoming_path(account))
        record = next((item for item in candidates if item.get("id") == share_id), None)
        if not record:
            return False
        is_owner = record.get("ownerAccount") == account
        own_path = shares_outgoing_path(account) if is_owner else shares_incoming_path(account)
        next_records = [item for item in read_share_records(own_path) if item.get("id") != share_id]
        atomic_write_json(own_path, next_records)
        other_account = record.get("recipientAccount") if is_owner else record.get("ownerAccount")
        other_path = shares_incoming_path(other_account) if is_owner else shares_outgoing_path(other_account)
        atomic_write_json(other_path, [item for item in read_share_records(other_path) if item.get("id") != share_id])
        append_event(account, "session.share.deleted", {"shareId": share_id})
        removed = True
    return removed


def login_or_create(account: str, password: str, device: dict[str, Any]) -> dict[str, Any]:
    ok, message = validate_account_password(account, password)
    if not ok:
        raise ValueError(message)

    normalized = normalize_account(account)
    with STATE_LOCK:
        path = account_record_path(normalized)
        record = read_json(path, None)
        created = False
        if record is None:
            record = {
                "version": 1,
                "account": normalized,
                "accountKey": account_key(normalized),
                "createdAt": utc_now(),
                "password": password_hash(password),
                "devices": [],
            }
            created = True
        elif not verify_password(password, record.get("password") or {}):
            append_event(normalized, "auth.failed", {"device": device})
            raise PermissionError("账号或密码不正确。")

        token = secrets.token_urlsafe(32)
        expires_at = int(time.time()) + TOKEN_TTL_SECONDS
        TOKENS[token] = {"account": normalized, "expiresAt": expires_at}

        record["lastLoginAt"] = utc_now()
        record["devices"] = upsert_device(record.get("devices") or [], device)
        atomic_write_json(path, record)
        append_event(normalized, "auth.login", {"created": created, "device": device})

    return {
        "ok": True,
        "created": created,
        "accountId": account_key(normalized),
        "token": token,
        "expiresAt": datetime.fromtimestamp(expires_at, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "ttlSeconds": TOKEN_TTL_SECONDS,
    }


def upsert_device(devices: list[Any], device: dict[str, Any]) -> list[dict[str, Any]]:
    now = utc_now()
    device_id = str(device.get("deviceId") or device.get("clientId") or "").strip()[:120]
    device_name = str(device.get("deviceName") or device.get("name") or "Unknown device").strip()[:160]
    platform = str(device.get("platform") or "").strip()[:80]
    if not device_id:
        device_id = hashlib.sha256(f"{device_name}:{platform}".encode("utf-8")).hexdigest()[:24]
    cleaned = [
        item
        for item in devices
        if isinstance(item, dict) and item.get("deviceId") != device_id
    ]
    cleaned.insert(0, {
        "deviceId": device_id,
        "deviceName": device_name,
        "platform": platform,
        "lastSeenAt": now,
    })
    return cleaned[:20]


def authenticate(headers: Any) -> str:
    auth = str(headers.get("Authorization") or "").strip()
    if not auth:
        raise PermissionError("缺少 Authorization。")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        with STATE_LOCK:
            session = TOKENS.get(token)
            if not session:
                raise PermissionError("登录已失效，请重新登录。")
            if int(session.get("expiresAt") or 0) < int(time.time()):
                TOKENS.pop(token, None)
                raise PermissionError("登录已过期，请重新登录。")
            return str(session["account"])
    raise PermissionError("Authorization 只支持 Bearer token。")


def public_status() -> dict[str, Any]:
    return {
        "ok": True,
        "service": APP_NAME,
        "version": SERVICE_VERSION,
        "time": utc_now(),
        "dataDir": str(DATA_DIR),
    }


class ConfigSyncHandler(BaseHTTPRequestHandler):
    server_version = "AIWorkbenchConfigSync/1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def do_OPTIONS(self) -> None:
        self.send_json({"ok": True})

    def do_GET(self) -> None:
        try:
            path, query = self.path_and_query()
            if path in {"/", "/health", "/v1/health", "/v1/version"}:
                self.send_json(public_status())
                return
            account = authenticate(self.headers)
            if path == "/v1/config":
                self.handle_get_config(account)
                return
            if path == "/v1/devices":
                self.handle_get_devices(account)
                return
            if path == "/v1/shares":
                self.handle_get_shares(account)
                return
            if path == "/v1/events":
                limit = int((query.get("limit") or ["50"])[0])
                self.send_json({"ok": True, "events": read_events(account, limit)})
                return
            self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在。")
        except Exception as error:
            self.send_exception(error)

    def do_POST(self) -> None:
        try:
            path, _query = self.path_and_query()
            body = self.read_json_body()
            if path == "/v1/auth/login":
                device = {
                    "deviceId": body.get("deviceId") or body.get("clientId") or "",
                    "deviceName": body.get("deviceName") or body.get("name") or "",
                    "platform": body.get("platform") or "",
                }
                result = login_or_create(str(body.get("account") or ""), str(body.get("password") or ""), device)
                self.send_json(result)
                return
            if path == "/v1/auth/logout":
                self.handle_logout()
                return
            if path == "/v1/shares":
                account = authenticate(self.headers)
                self.handle_post_share(account, body)
                return
            self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在。")
        except Exception as error:
            self.send_exception(error)

    def do_PUT(self) -> None:
        try:
            path, _query = self.path_and_query()
            account = authenticate(self.headers)
            if path == "/v1/config":
                self.handle_put_config(account, self.read_json_body())
                return
            self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在。")
        except Exception as error:
            self.send_exception(error)

    def do_DELETE(self) -> None:
        try:
            path, _query = self.path_and_query()
            account = authenticate(self.headers)
            if path == "/v1/config":
                self.handle_delete_config(account)
                return
            if path.startswith("/v1/shares/"):
                share_id = path.rsplit("/", 1)[-1]
                self.handle_delete_share(account, share_id)
                return
            self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在。")
        except Exception as error:
            self.send_exception(error)

    def path_and_query(self) -> tuple[str, dict[str, list[str]]]:
        parsed = urlparse(self.path)
        return parsed.path, parse_qs(parsed.query)

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length > MAX_BODY_BYTES:
            raise ValueError(f"请求太大，最大 {MAX_BODY_BYTES} 字节。")
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError(f"JSON 格式错误：{error.msg}") from error
        if not isinstance(parsed, dict):
            raise ValueError("请求体必须是 JSON 对象。")
        return parsed

    def handle_get_config(self, account: str) -> None:
        record = read_json(config_record_path(account), None)
        if record is None:
            self.send_json({"ok": True, "config": None, "revision": 0, "updatedAt": None})
            return
        self.send_json({"ok": True, **record})

    def handle_put_config(self, account: str, body: dict[str, Any]) -> None:
        if not any(key in body for key in ("encryptedPayload", "payload", "config")):
            raise ValueError("缺少配置内容。请上传 encryptedPayload 或 payload。")

        with STATE_LOCK:
            current = read_json(config_record_path(account), None)
            current_revision = int(current.get("revision") or 0) if current else 0
            base_revision = body.get("baseRevision")
            if base_revision is not None and int(base_revision) != current_revision:
                self.send_json(
                    {
                        "ok": False,
                        "error": "配置已被其他设备更新，请先拉取最新配置。",
                        "code": "revision_conflict",
                        "currentRevision": current_revision,
                    },
                    status=HTTPStatus.CONFLICT,
                )
                return

            next_revision = current_revision + 1
            updated_by = {
                "clientId": str(body.get("clientId") or body.get("deviceId") or "").strip()[:120],
                "deviceName": str(body.get("deviceName") or "").strip()[:160],
                "platform": str(body.get("platform") or "").strip()[:80],
            }
            data = {
                "encrypted": bool(body.get("encrypted", "encryptedPayload" in body)),
                "contentType": str(body.get("contentType") or "application/json")[:120],
                "encoding": str(body.get("encoding") or ("base64" if "encryptedPayload" in body else "json"))[:80],
                "schemaVersion": body.get("schemaVersion"),
                "checksum": str(body.get("checksum") or "").strip()[:160],
                "encryptedPayload": body.get("encryptedPayload"),
                "payload": body.get("payload", body.get("config")),
            }
            record = {
                "version": 1,
                "revision": next_revision,
                "updatedAt": utc_now(),
                "updatedBy": updated_by,
                "data": data,
            }
            atomic_write_json(config_record_path(account), record)
            account_record = read_json(account_record_path(account), {})
            account_record["devices"] = upsert_device(account_record.get("devices") or [], updated_by)
            atomic_write_json(account_record_path(account), account_record)
            append_event(account, "config.updated", {"revision": next_revision, "updatedBy": updated_by})
        self.send_json({"ok": True, "revision": next_revision, "updatedAt": record["updatedAt"]})

    def handle_delete_config(self, account: str) -> None:
        with STATE_LOCK:
            path = config_record_path(account)
            if path.exists():
                path.unlink()
            append_event(account, "config.deleted")
        self.send_json({"ok": True, "revision": 0})

    def handle_get_devices(self, account: str) -> None:
        record = read_json(account_record_path(account), {})
        self.send_json({"ok": True, "devices": record.get("devices") or []})

    def handle_get_shares(self, account: str) -> None:
        incoming = read_share_records(shares_incoming_path(account))
        outgoing = read_share_records(shares_outgoing_path(account))
        self.send_json({"ok": True, "incoming": incoming, "outgoing": outgoing})

    def handle_post_share(self, account: str, body: dict[str, Any]) -> None:
        record = create_share(account, body)
        self.send_json({"ok": True, "share": record})

    def handle_delete_share(self, account: str, share_id: str) -> None:
        removed = delete_share(account, share_id)
        self.send_json({"ok": True, "removed": removed})

    def handle_logout(self) -> None:
        auth = str(self.headers.get("Authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
            with STATE_LOCK:
                TOKENS.pop(token, None)
        self.send_json({"ok": True})

    def send_exception(self, error: Exception) -> None:
        if isinstance(error, PermissionError):
            self.log_error("Request failed: unauthorized: %s", str(error))
            self.send_error_json(HTTPStatus.UNAUTHORIZED, str(error), code="bad_credentials")
            return
        if isinstance(error, ValueError):
            message = str(error)
            code = (
                "invalid_account"
                if message.startswith("同步账号只能")
                else "missing_password"
                if message.startswith("请填写同步密码")
                else "bad_request"
            )
            self.log_error("Request failed: %s: %s", code, message)
            self.send_error_json(HTTPStatus.BAD_REQUEST, message, code=code)
            return
        self.log_error("Unhandled error: %r", error)
        self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "服务内部错误。", code="internal_error")

    def send_error_json(self, status: HTTPStatus, message: str, code: str = "error") -> None:
        self.send_json({"ok": False, "error": message, "code": code}, status=status)

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json_dumps(payload)
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type")
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    safe_mkdir(DATA_DIR)
    safe_mkdir(DATA_DIR / "accounts")

    server = ThreadingHTTPServer((HOST, PORT), ConfigSyncHandler)
    server.timeout = 1

    def stop(_signum: int, _frame: Any) -> None:
        SHOULD_EXIT.set()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(f"{APP_NAME} v{SERVICE_VERSION} listening on {HOST}:{PORT}", flush=True)
    while not SHOULD_EXIT.is_set():
        server.handle_request()
    server.server_close()
    print(f"{APP_NAME} stopped", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
