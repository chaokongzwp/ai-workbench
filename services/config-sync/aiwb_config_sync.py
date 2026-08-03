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
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


APP_NAME = "AI Workbench Config Sync"
SERVICE_VERSION = 5
MAX_BODY_BYTES = int(os.environ.get("AIWB_CONFIG_SYNC_MAX_BODY_BYTES", str(2 * 1024 * 1024)))
DATA_DIR = Path(os.environ.get("AIWB_CONFIG_SYNC_DATA_DIR", "/opt/ai-workbench-config-sync/data"))
HOST = os.environ.get("AIWB_CONFIG_SYNC_HOST", "0.0.0.0")
PORT = int(os.environ.get("AIWB_CONFIG_SYNC_PORT", "18088"))
TOKEN_TTL_SECONDS = int(os.environ.get("AIWB_CONFIG_SYNC_TOKEN_TTL_SECONDS", str(7 * 24 * 60 * 60)))
PBKDF2_ITERATIONS = int(os.environ.get("AIWB_CONFIG_SYNC_PBKDF2_ITERATIONS", "260000"))
ACCOUNT_PATTERN = re.compile(r"^[a-zA-Z0-9_.@+-]{2,96}$")
PUSH_TICKET_TTL_SECONDS = int(os.environ.get("AIWB_PUSH_TICKET_TTL_SECONDS", str(7 * 24 * 60 * 60)))
APNS_KEY_ID = os.environ.get("AIWB_APNS_KEY_ID", "").strip()
APNS_TEAM_ID = os.environ.get("AIWB_APNS_TEAM_ID", "").strip()
APNS_BUNDLE_ID = os.environ.get("AIWB_APNS_BUNDLE_ID", "com.beexofficial.beex.test").strip()
APNS_KEY_PATH = Path(os.environ.get("AIWB_APNS_KEY_PATH", "/opt/ai-workbench-config-sync/secrets/apns-auth-key.p8"))
AGENT_CONTROL_ADMIN_TOKEN = os.environ.get("AIWB_AGENT_CONTROL_ADMIN_TOKEN", "").strip()
AGENT_CONTROL_DEFAULT_MANIFEST_URL = os.environ.get(
    "AIWB_AGENT_CONTROL_DEFAULT_MANIFEST_URL",
    "https://raw.githubusercontent.com/chaokongzwp/ai-workbench/main/agent/latest.json",
).strip()
AGENT_CONTROL_DISPATCH_TIMEOUT_SECONDS = int(os.environ.get("AIWB_AGENT_CONTROL_DISPATCH_TIMEOUT_SECONDS", "12"))


STATE_LOCK = threading.RLock()
TOKENS: dict[str, dict[str, Any]] = {}
SHOULD_EXIT = threading.Event()
APNS_JWT_CACHE: dict[str, Any] = {"token": "", "createdAt": 0}


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


def sha256_hex(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()


def base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def read_der_length(value: bytes, offset: int) -> tuple[int, int]:
    first = value[offset]
    if first < 0x80:
        return first, offset + 1
    count = first & 0x7F
    if count < 1 or count > 4:
        raise ValueError("APNs 签名长度无效。")
    end = offset + 1 + count
    return int.from_bytes(value[offset + 1 : end], "big"), end


def der_ecdsa_signature_to_raw(value: bytes, size: int = 32) -> bytes:
    if not value or value[0] != 0x30:
        raise ValueError("APNs 签名格式无效。")
    _sequence_length, offset = read_der_length(value, 1)
    integers: list[bytes] = []
    for _index in range(2):
        if offset >= len(value) or value[offset] != 0x02:
            raise ValueError("APNs 签名格式无效。")
        integer_length, integer_offset = read_der_length(value, offset + 1)
        integer = value[integer_offset : integer_offset + integer_length].lstrip(b"\x00")
        integers.append(integer.rjust(size, b"\x00")[-size:])
        offset = integer_offset + integer_length
    return integers[0] + integers[1]


def apns_ready() -> bool:
    return bool(APNS_KEY_ID and APNS_TEAM_ID and APNS_BUNDLE_ID and APNS_KEY_PATH.exists())


def apns_provider_token() -> str:
    now = int(time.time())
    cached = str(APNS_JWT_CACHE.get("token") or "")
    created_at = int(APNS_JWT_CACHE.get("createdAt") or 0)
    if cached and now - created_at < 45 * 60:
        return cached
    if not apns_ready():
        raise RuntimeError("APNs 服务尚未配置。")

    header = base64url(json_dumps({"alg": "ES256", "kid": APNS_KEY_ID}))
    payload = base64url(json_dumps({"iss": APNS_TEAM_ID, "iat": now}))
    signing_input = f"{header}.{payload}".encode("ascii")
    completed = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", str(APNS_KEY_PATH)],
        input=signing_input,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=10,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.decode("utf-8", errors="replace").strip() or "APNs 签名失败。")
    signature = base64url(der_ecdsa_signature_to_raw(completed.stdout))
    token = f"{header}.{payload}.{signature}"
    APNS_JWT_CACHE.update({"token": token, "createdAt": now})
    return token


def push_device_path(installation_id: str) -> Path:
    return DATA_DIR / "push" / "devices" / f"{sha256_hex(installation_id)}.json"


def push_ticket_path(ticket_id: str) -> Path:
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(ticket_id or ""))[:160]
    return DATA_DIR / "push" / "tickets" / f"{safe_id}.json"


def validate_installation_id(value: Any) -> str:
    installation_id = str(value or "").strip()
    if not re.fullmatch(r"[a-zA-Z0-9._:-]{16,160}", installation_id):
        raise ValueError("设备标识无效。")
    return installation_id


def validate_apns_token(value: Any) -> str:
    token = re.sub(r"[^a-fA-F0-9]", "", str(value or "")).lower()
    if len(token) < 32 or len(token) > 512:
        raise ValueError("APNs 设备令牌无效。")
    return token


def register_push_device(body: dict[str, Any]) -> dict[str, Any]:
    installation_id = validate_installation_id(body.get("installationId"))
    device_token = validate_apns_token(body.get("deviceToken"))
    device_secret = secrets.token_urlsafe(36)
    record = {
        "version": 1,
        "installationId": installation_id,
        "deviceToken": device_token,
        "deviceSecretHash": sha256_hex(device_secret),
        "platform": "ios",
        "deviceName": str(body.get("deviceName") or "iPhone / iPad").strip()[:160],
        "bundleId": APNS_BUNDLE_ID,
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
        "lastPushAt": None,
        "lastPushEnvironment": "",
    }
    with STATE_LOCK:
        current = read_json(push_device_path(installation_id), None)
        if isinstance(current, dict):
            record["createdAt"] = current.get("createdAt") or record["createdAt"]
            record["lastPushAt"] = current.get("lastPushAt")
            record["lastPushEnvironment"] = current.get("lastPushEnvironment") or ""
        atomic_write_json(push_device_path(installation_id), record)
    return {
        "ok": True,
        "installationId": installation_id,
        "deviceSecret": device_secret,
        "pushReady": apns_ready(),
    }


def authenticate_push_device(headers: Any) -> dict[str, Any]:
    auth = str(headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("device "):
        raise PermissionError("缺少设备授权。")
    credentials = auth[7:].strip()
    installation_id, separator, device_secret = credentials.partition(":")
    if not separator or not device_secret:
        raise PermissionError("设备授权无效。")
    installation_id = validate_installation_id(installation_id)
    record = read_json(push_device_path(installation_id), None)
    if not isinstance(record, dict) or not hmac.compare_digest(
        str(record.get("deviceSecretHash") or ""),
        sha256_hex(device_secret),
    ):
        raise PermissionError("设备授权已失效，请重新开启任务通知。")
    return record


def create_push_ticket(device: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    task_id = str(body.get("taskId") or "").strip()[:220]
    conversation_id = str(body.get("conversationId") or "").strip()[:220]
    if not task_id or not conversation_id:
        raise ValueError("通知票据缺少任务或会话标识。")
    ticket_id = f"push-{secrets.token_urlsafe(22)}"
    notify_token = secrets.token_urlsafe(40)
    now_epoch = int(time.time())
    record = {
        "version": 1,
        "ticketId": ticket_id,
        "notifyTokenHash": sha256_hex(notify_token),
        "installationId": device["installationId"],
        "taskId": task_id,
        "conversationId": conversation_id,
        "conversationName": str(body.get("conversationName") or "AI Workbench").strip()[:160],
        "agentId": "claude" if body.get("agentId") == "claude" else "codex",
        "createdAt": utc_now(),
        "expiresAt": now_epoch + PUSH_TICKET_TTL_SECONDS,
        "terminalStatus": "",
        "notifiedAt": None,
        "delivery": None,
    }
    with STATE_LOCK:
        atomic_write_json(push_ticket_path(ticket_id), record)
    return {
        "ok": True,
        "ticketId": ticket_id,
        "notifyToken": notify_token,
        "notifyPath": f"/v1/push/tickets/{ticket_id}/complete",
        "expiresAt": record["expiresAt"],
        "pushReady": apns_ready(),
    }


def authenticate_push_ticket(headers: Any, ticket_id: str) -> dict[str, Any]:
    auth = str(headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        raise PermissionError("缺少通知票据授权。")
    record = read_json(push_ticket_path(ticket_id), None)
    if not isinstance(record, dict):
        raise ValueError("通知票据不存在或已过期。")
    if int(record.get("expiresAt") or 0) < int(time.time()):
        raise ValueError("通知票据不存在或已过期。")
    token = auth[7:].strip()
    if not hmac.compare_digest(str(record.get("notifyTokenHash") or ""), sha256_hex(token)):
        raise PermissionError("通知票据授权无效。")
    return record


def send_apns_notification(device: dict[str, Any], ticket: dict[str, Any], status: str) -> dict[str, Any]:
    if not apns_ready():
        return {"delivered": False, "reason": "apns_not_configured"}
    status_text = {
        "done": "任务已完成",
        "error": "任务执行失败",
        "cancelled": "任务已取消",
    }[status]
    agent_name = "Claude" if ticket.get("agentId") == "claude" else "Codex"
    conversation_name = str(ticket.get("conversationName") or "AI Workbench").strip()
    payload = {
        "aps": {
            "alert": {
                "title": conversation_name,
                "body": f"{agent_name} {status_text}",
            },
            "sound": "default",
            "thread-id": str(ticket.get("conversationId") or "")[:64],
        },
        "conversationId": ticket.get("conversationId"),
        "taskId": ticket.get("taskId"),
        "status": status,
        "agentId": ticket.get("agentId"),
    }
    provider_token = apns_provider_token()
    attempts = []
    preferred = str(device.get("lastPushEnvironment") or "")
    environments = [preferred] if preferred in {"production", "sandbox"} else []
    environments += [item for item in ("production", "sandbox") if item not in environments]
    for environment in environments:
        hostname = "api.push.apple.com" if environment == "production" else "api.sandbox.push.apple.com"
        command = [
            "curl",
            "--silent",
            "--show-error",
            "--http2",
            "--max-time",
            "15",
            "--write-out",
            "\n%{http_code}",
            "--request",
            "POST",
            "--header",
            f"authorization: bearer {provider_token}",
            "--header",
            f"apns-topic: {APNS_BUNDLE_ID}",
            "--header",
            "apns-push-type: alert",
            "--header",
            "apns-priority: 10",
            "--header",
            f"apns-collapse-id: {ticket.get('taskId')}",
            "--data-binary",
            "@-",
            f"https://{hostname}/3/device/{device['deviceToken']}",
        ]
        completed = subprocess.run(
            command,
            input=json_dumps(payload),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=20,
        )
        output = completed.stdout.decode("utf-8", errors="replace")
        response_body, _separator, status_code = output.rpartition("\n")
        attempts.append({
            "environment": environment,
            "status": status_code,
            "body": response_body[:500],
            "error": completed.stderr.decode("utf-8", errors="replace")[:500],
        })
        if completed.returncode == 0 and status_code == "200":
            next_device = {**device, "lastPushAt": utc_now(), "lastPushEnvironment": environment}
            atomic_write_json(push_device_path(str(device["installationId"])), next_device)
            return {"delivered": True, "environment": environment}
        if status_code not in {"400", "403"} or "BadDeviceToken" not in response_body:
            break
    return {"delivered": False, "reason": "apns_rejected", "attempts": attempts}


def complete_push_ticket(headers: Any, ticket_id: str, body: dict[str, Any]) -> dict[str, Any]:
    ticket = authenticate_push_ticket(headers, ticket_id)
    status = str(body.get("status") or "").strip().lower()
    if status not in {"done", "error", "cancelled"}:
        raise ValueError("通知状态无效。")
    if ticket.get("notifiedAt") and ticket.get("terminalStatus") == status:
        return {"ok": True, "delivered": bool((ticket.get("delivery") or {}).get("delivered")), "duplicate": True}
    device = read_json(push_device_path(str(ticket.get("installationId") or "")), None)
    if not isinstance(device, dict):
        raise ValueError("接收通知的设备已不存在。")
    delivery = send_apns_notification(device, ticket, status)
    next_ticket = {
        **ticket,
        "terminalStatus": status,
        "notifiedAt": utc_now() if delivery.get("delivered") else None,
        "lastAttemptAt": utc_now(),
        "delivery": delivery,
    }
    with STATE_LOCK:
        atomic_write_json(push_ticket_path(ticket_id), next_ticket)
    return {"ok": True, **delivery}


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
        "push": {
            "platforms": ["ios"],
            "ready": apns_ready(),
        },
    }


def agent_control_record_path() -> Path:
    return DATA_DIR / "agent-control" / "latest.json"


def agent_control_agents_path() -> Path:
    return DATA_DIR / "agent-control" / "agents.json"


def agent_control_latest() -> dict[str, Any]:
    record = read_json(agent_control_record_path(), None)
    if isinstance(record, dict) and str(record.get("manifestUrl") or "").strip():
        return record
    return {
        "version": "bootstrap",
        "manifestUrl": AGENT_CONTROL_DEFAULT_MANIFEST_URL,
        "publishedAt": None,
        "source": "default",
    }


def require_agent_control_admin(headers: Any) -> None:
    if not AGENT_CONTROL_ADMIN_TOKEN:
        raise PermissionError("Agent 控制平面尚未配置发布令牌。")
    auth = str(headers.get("Authorization") or "").strip()
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not token or not hmac.compare_digest(token, AGENT_CONTROL_ADMIN_TOKEN):
        raise PermissionError("Agent 控制平面发布授权无效。")


def agent_version_number(value: Any) -> int:
    matched = re.search(r"\d+", str(value or ""))
    return int(matched.group(0)) if matched else 0


def normalize_agent_callback_endpoint(value: Any) -> str:
    raw = str(value or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Agent HTTPS 地址无效。")
    if parsed.path not in {"", "/"} or parsed.params or parsed.query or parsed.fragment:
        raise ValueError("Agent HTTPS 地址不能包含路径或参数。")
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def read_agent_control_clients() -> list[dict[str, Any]]:
    records = read_json(agent_control_agents_path(), [])
    return [item for item in records if isinstance(item, dict)] if isinstance(records, list) else []


def update_agent_control_client(agent_id: str, **changes: Any) -> None:
    with STATE_LOCK:
        records = read_agent_control_clients()
        changed = False
        for record in records:
            if record.get("agentId") == agent_id:
                record.update(changes)
                changed = True
                break
        if changed:
            atomic_write_json(agent_control_agents_path(), records[:2000])


def register_agent_control_client(body: dict[str, Any]) -> dict[str, Any]:
    agent_id = str(body.get("agentId") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._:-]{16,160}", agent_id):
        raise ValueError("Agent 标识无效。")
    update_token = str(body.get("updateToken") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{24,256}", update_token):
        raise ValueError("Agent 升级凭证无效。")
    record = {
        "agentId": agent_id,
        "endpoint": normalize_agent_callback_endpoint(body.get("endpoint")),
        # This token can only trigger the Agent's fixed self-update action;
        # it is deliberately different from the task API bearer token.
        "updateToken": update_token,
        "version": str(body.get("version") or "").strip()[:80],
        "platform": str(body.get("platform") or "unknown").strip()[:40],
        "hostname": str(body.get("hostname") or "").strip()[:160],
        "lastSeenAt": utc_now(),
    }
    with STATE_LOCK:
        records = [item for item in read_agent_control_clients() if item.get("agentId") != agent_id]
        records.insert(0, record)
        atomic_write_json(agent_control_agents_path(), records[:2000])
    latest = agent_control_latest()
    update_required = agent_version_number(record["version"]) < agent_version_number(latest.get("version"))
    if update_required:
        threading.Thread(target=dispatch_agent_updates, args=(latest, {agent_id}), daemon=True).start()
    return {"ok": True, "agentId": agent_id, "targetVersion": latest.get("version", ""), "updateRequired": update_required}


def dispatch_agent_update(client: dict[str, Any], target: dict[str, Any]) -> None:
    agent_id = str(client.get("agentId") or "")
    endpoint = str(client.get("endpoint") or "").rstrip("/")
    try:
        request = urllib.request.Request(
            f"{endpoint}/v1/control/update",
            data=json_dumps({"version": target.get("version", "")}),
            headers={"Content-Type": "application/json", "X-AIWB-Agent-Update-Token": str(client.get("updateToken") or "")},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=max(3, AGENT_CONTROL_DISPATCH_TIMEOUT_SECONDS)) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"Agent 返回 HTTP {response.status}")
            response.read(64 * 1024)
        update_agent_control_client(agent_id, lastUpdateAt=utc_now(), lastUpdateStatus="accepted", targetVersion=target.get("version", ""))
    except Exception as error:
        update_agent_control_client(agent_id, lastUpdateAt=utc_now(), lastUpdateStatus=f"failed: {str(error)[:300]}", targetVersion=target.get("version", ""))


def dispatch_agent_updates(target: dict[str, Any], only_agent_ids: set[str] | None = None) -> None:
    target_version = agent_version_number(target.get("version"))
    for client in read_agent_control_clients():
        if only_agent_ids is not None and str(client.get("agentId") or "") not in only_agent_ids:
            continue
        if agent_version_number(client.get("version")) >= target_version:
            continue
        dispatch_agent_update(client, target)


def publish_agent_control(headers: Any, body: dict[str, Any]) -> dict[str, Any]:
    require_agent_control_admin(headers)
    manifest_url = str(body.get("manifestUrl") or "").strip()
    if not manifest_url.startswith("https://"):
        raise ValueError("Agent manifestUrl 必须是 HTTPS 地址。")
    record = {
        "version": str(body.get("version") or "").strip()[:80] or "published",
        "manifestUrl": manifest_url[:1024],
        "windowsManifestUrl": str(body.get("windowsManifestUrl") or "").strip()[:1024],
        "publishedAt": utc_now(),
        "source": "published",
    }
    with STATE_LOCK:
        atomic_write_json(agent_control_record_path(), record)
    threading.Thread(target=dispatch_agent_updates, args=(record,), daemon=True).start()
    return {"ok": True, "agent": record}


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
            if path == "/v1/agent-control/latest":
                latest = agent_control_latest()
                self.send_json({"ok": True, "agent": latest, "manifestUrl": latest.get("manifestUrl", ""), "windowsManifestUrl": latest.get("windowsManifestUrl", "")})
                return
            if path == "/v1/agent-control/agents":
                require_agent_control_admin(self.headers)
                self.send_json({"ok": True, "agents": read_agent_control_clients()})
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
            if path == "/v1/agent-control/publish":
                self.send_json(publish_agent_control(self.headers, body))
                return
            if path == "/v1/agent-control/register":
                self.send_json(register_agent_control_client(body))
                return
            if path == "/v1/push/devices/register":
                self.send_json(register_push_device(body))
                return
            if path == "/v1/push/tickets":
                device = authenticate_push_device(self.headers)
                self.send_json(create_push_ticket(device, body))
                return
            push_ticket_match = re.fullmatch(r"/v1/push/tickets/([a-zA-Z0-9_-]+)/complete", path)
            if push_ticket_match:
                result = complete_push_ticket(self.headers, push_ticket_match.group(1), body)
                self.send_json(
                    result,
                    status=HTTPStatus.OK if result.get("delivered") else HTTPStatus.SERVICE_UNAVAILABLE,
                )
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
    safe_mkdir(DATA_DIR / "push" / "devices")
    safe_mkdir(DATA_DIR / "push" / "tickets")

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
