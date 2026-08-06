package com.beexofficial.beex.test;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.jcraft.jsch.Channel;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.HostKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.UserInfo;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

@CapacitorPlugin(name = "SSHWorkbench")
public class SSHWorkbenchPlugin extends Plugin {
    private static final String PROFILE_PREFS = "ai_workbench_profile";
    private static final String PROFILE_KEY = "profile";
    private static final int MAX_RESPONSE_LIMIT = 83_886_080;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ScheduledExecutorService connectionScheduler = Executors.newSingleThreadScheduledExecutor();
    private final Object commandConnectionLock = new Object();
    private final ConcurrentHashMap<String, String> commandSessionFingerprints = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PooledCommandConnection> commandConnections = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, TerminalSession> terminalSessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, HttpURLConnection> agentUploadConnections = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AgentEventStreamHandle> agentEventStreams = new ConcurrentHashMap<>();
    private final Set<String> cancelledAgentUploads = ConcurrentHashMap.newKeySet();

    @Override
    protected void handleOnDestroy() {
        for (AgentEventStreamHandle stream : agentEventStreams.values()) stream.stop();
        agentEventStreams.clear();
        for (TerminalSession terminal : terminalSessions.values()) {
            terminal.close();
        }
        for (PooledCommandConnection connection : commandConnections.values()) {
            connection.close();
        }
        commandConnections.clear();
        commandSessionFingerprints.clear();
        terminalSessions.clear();
        for (HttpURLConnection connection : agentUploadConnections.values()) connection.disconnect();
        agentUploadConnections.clear();
        cancelledAgentUploads.clear();
        connectionScheduler.shutdownNow();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void connectSession(PluginCall call) {
        SSHConfig config;
        try {
            config = SSHConfig.fromConnection(call);
        } catch (Exception error) {
            call.reject(safeError(error), "SSH_CONFIG_INVALID", error);
            return;
        }
        emitConnectionState(config.sessionId, "connecting", "");
        executor.execute(() -> {
            try {
                ensureCommandSession(config);
                emitConnectionState(config.sessionId, "connected", "");
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("sessionId", config.sessionId);
                result.put("state", "connected");
                call.resolve(result);
            } catch (Exception error) {
                emitConnectionState(config.sessionId, "error", friendlySSHError(error, config));
                call.reject(friendlySSHError(error, config), "SSH_CONNECTION_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void disconnectSession(PluginCall call) {
        String sessionId = stringValue(call.getString("sessionId")).trim();
        if (sessionId.isEmpty()) {
            call.reject("Missing required field: sessionId", "SSH_CONFIG_INVALID");
            return;
        }
        boolean preserveTransport = Boolean.TRUE.equals(call.getBoolean("preserveTransport", false));
        detachCommandSession(sessionId, preserveTransport);
        emitConnectionState(sessionId, "closed", "已断开");
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("sessionId", sessionId);
        call.resolve(result);
    }

    @PluginMethod
    public void runCommand(PluginCall call) {
        long startedAt = System.currentTimeMillis();
        SSHConfig config;
        try {
            config = SSHConfig.from(call);
        } catch (Exception error) {
            appendDiagnosticLog("error", "ssh.android.config_invalid", objectOf("error", safeError(error)));
            call.reject(safeError(error), "SSH_CONFIG_INVALID", error);
            return;
        }

        String requestId = UUID.randomUUID().toString().substring(0, 8);
        appendDiagnosticLog("info", "ssh.android.start", objectOf(
            "requestId", requestId,
            "host", config.host,
            "port", config.port,
            "username", config.username,
            "passwordLength", config.password.length(),
            "commandKind", config.uploadScript ? "uploaded-powershell" : (config.stdin.isEmpty() ? "exec" : "stdin"),
            "stdinLength", config.stdin.length(),
            "connectTimeoutSeconds", config.connectTimeoutSeconds,
            "commandTimeoutSeconds", config.commandTimeoutSeconds
        ));

        executor.execute(() -> {
            try {
                String output = executeWithRetry(config, requestId);
                appendDiagnosticLog("info", "ssh.android.success", objectOf(
                    "requestId", requestId,
                    "durationMs", System.currentTimeMillis() - startedAt,
                    "outputLength", output.length()
                ));
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("stdout", output);
                result.put("durationMs", System.currentTimeMillis() - startedAt);
                call.resolve(result);
            } catch (Exception error) {
                appendDiagnosticLog("error", "ssh.android.failed", objectOf(
                    "requestId", requestId,
                    "host", config.host,
                    "port", config.port,
                    "username", config.username,
                    "durationMs", System.currentTimeMillis() - startedAt,
                    "error", safeError(error)
                ));
                String hostKeyError = safeError(error);
                call.reject(
                    hostKeyError.startsWith("SSH_HOST_KEY_") ? hostKeyError : "SSH command failed: " + hostKeyError,
                    "SSH_COMMAND_FAILED",
                    error
                );
            }
        });
    }

    @PluginMethod
    public void agentRequest(PluginCall call) {
        String endpoint = stringValue(call.getString("endpoint")).trim();
        String accessToken = stringValue(call.getString("accessToken")).trim();
        String path = stringValue(call.getString("path"));
        String expectedFingerprint = stringValue(call.getString("tlsFingerprint"))
            .replaceFirst("(?i)^sha256/", "").trim();
        boolean allowInsecure = Boolean.TRUE.equals(call.getBoolean("allowInsecure", false));
        if (endpoint.isEmpty() || accessToken.isEmpty()) {
            call.reject("Agent 直连配置不完整。", "AGENT_REQUEST_INVALID");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL base = new URL(endpoint.endsWith("/") ? endpoint : endpoint + "/");
                URL url = new URL(base, path.startsWith("/") ? path.substring(1) : path);
                boolean secure = "https".equalsIgnoreCase(url.getProtocol());
                if (!secure && !allowInsecure) throw new IOException("Agent 未启用 TLS，拒绝使用不加密连接。");
                if (secure && expectedFingerprint.isEmpty()) throw new IOException("缺少 Agent TLS 证书指纹，无法建立安全连接。");
                connection = (HttpURLConnection) url.openConnection();
                if (secure) configurePinnedHttps((HttpsURLConnection) connection, expectedFingerprint);
                connection.setRequestMethod(stringValue(call.getString("method")).isEmpty() ? "GET" : call.getString("method").toUpperCase(Locale.ROOT));
                connection.setConnectTimeout(Math.max(1_000, Math.min(call.getInt("timeoutMs", 12_000), 120_000)));
                connection.setReadTimeout(Math.max(1_000, Math.min(call.getInt("timeoutMs", 12_000), 120_000)));
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Authorization", "Bearer " + accessToken);
                JSObject body = call.getObject("body");
                if (body != null) {
                    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setRequestProperty("Content-Length", String.valueOf(bytes.length));
                    try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
                }
                int status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String responseBody = stream == null ? "" : readStream(stream);
                JSObject result = new JSObject();
                result.put("status", status);
                result.put("body", responseBody);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(safeError(error), "AGENT_REQUEST_FAILED", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private final class AgentEventStreamHandle {
        final OkHttpClient client;
        final AtomicBoolean stopped = new AtomicBoolean(false);
        volatile WebSocket socket;

        AgentEventStreamHandle(OkHttpClient client) { this.client = client; }

        void stop() {
            if (!stopped.compareAndSet(false, true)) return;
            WebSocket active = socket;
            if (active != null) active.close(1000, "client-stop");
            client.dispatcher().executorService().shutdown();
            client.connectionPool().evictAll();
        }
    }

    private X509TrustManager pinnedAgentTrustManager(String expectedFingerprint) throws Exception {
        final byte[] expected = Base64.decode(expectedFingerprint, Base64.DEFAULT);
        return new X509TrustManager() {
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
            @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            @Override public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                try {
                    if (chain == null || chain.length == 0) throw new CertificateException("Agent TLS 证书缺失。");
                    byte[] actual = MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());
                    if (!MessageDigest.isEqual(expected, actual)) {
                        throw new CertificateException("Agent TLS 证书指纹不匹配，已阻止事件流连接。");
                    }
                } catch (CertificateException error) {
                    throw error;
                } catch (Exception error) {
                    throw new CertificateException("Agent TLS 证书校验失败。", error);
                }
            }
        };
    }

    private void emitAgentEvent(String streamId, String state, Object event, Throwable error) {
        JSObject payload = new JSObject();
        payload.put("streamId", streamId);
        payload.put("state", state);
        if (event != null) payload.put("event", event);
        if (error != null) {
            payload.put("error", error instanceof Exception ? safeError((Exception) error) : stringValue(error.getMessage()));
        }
        notifyTerminalListeners("agentEvent", payload);
    }

    @PluginMethod
    public void startAgentEventStream(PluginCall call) {
        String streamId = stringValue(call.getString("streamId")).trim();
        String endpoint = stringValue(call.getString("endpoint")).trim();
        String accessToken = stringValue(call.getString("accessToken")).trim();
        String expectedFingerprint = stringValue(call.getString("tlsFingerprint"))
            .replaceFirst("(?i)^sha256/", "").trim();
        if (streamId.isEmpty() || endpoint.isEmpty() || accessToken.isEmpty() || expectedFingerprint.isEmpty()) {
            call.reject("Agent 事件流配置不完整。", "AGENT_EVENT_INVALID");
            return;
        }
        if (!endpoint.toLowerCase(Locale.ROOT).startsWith("https://")) {
            call.reject("Agent 事件流必须使用 TLS。", "AGENT_EVENT_TLS_REQUIRED");
            return;
        }
        try {
            AgentEventStreamHandle previous = agentEventStreams.remove(streamId);
            if (previous != null) previous.stop();
            X509TrustManager trustManager = pinnedAgentTrustManager(expectedFingerprint);
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[] { trustManager }, new SecureRandom());
            OkHttpClient client = new OkHttpClient.Builder()
                .sslSocketFactory(context.getSocketFactory(), trustManager)
                .hostnameVerifier((hostname, session) -> true)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build();
            AgentEventStreamHandle handle = new AgentEventStreamHandle(client);
            agentEventStreams.put(streamId, handle);
            String url = endpoint.replaceFirst("(?i)^https://", "wss://").replaceAll("/+$", "") + "/v1/events";
            Request request = new Request.Builder()
                .url(url)
                .header("Sec-WebSocket-Protocol", "aiwb.v1, bearer." + accessToken)
                .build();
            handle.socket = client.newWebSocket(request, new WebSocketListener() {
                @Override public void onOpen(WebSocket webSocket, Response response) {
                    if (!"aiwb.v1".equals(response.header("Sec-WebSocket-Protocol"))) {
                        webSocket.close(1002, "protocol-mismatch");
                        emitAgentEvent(streamId, "error", null, new IOException("Agent WebSocket 协议不匹配。"));
                        return;
                    }
                    emitAgentEvent(streamId, "open", null, null);
                }

                @Override public void onMessage(WebSocket webSocket, String text) {
                    try {
                        emitAgentEvent(streamId, "event", new JSONObject(text), null);
                    } catch (JSONException error) {
                        webSocket.close(1007, "invalid-json");
                        emitAgentEvent(streamId, "error", null, error);
                    }
                }

                @Override public void onMessage(WebSocket webSocket, ByteString bytes) {
                    onMessage(webSocket, bytes.string(StandardCharsets.UTF_8));
                }

                @Override public void onClosed(WebSocket webSocket, int code, String reason) {
                    AgentEventStreamHandle removed = agentEventStreams.remove(streamId);
                    if (removed != null) removed.stop();
                    emitAgentEvent(streamId, "closed", null, null);
                }

                @Override public void onFailure(WebSocket webSocket, Throwable throwable, Response response) {
                    AgentEventStreamHandle removed = agentEventStreams.remove(streamId);
                    if (removed != null) removed.stop();
                    emitAgentEvent(streamId, "error", null, throwable);
                }
            });
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("streamId", streamId);
            result.put("state", "connecting");
            call.resolve(result);
        } catch (Exception error) {
            AgentEventStreamHandle failed = agentEventStreams.remove(streamId);
            if (failed != null) failed.stop();
            call.reject(safeError(error), "AGENT_EVENT_FAILED", error);
        }
    }

    @PluginMethod
    public void stopAgentEventStream(PluginCall call) {
        String streamId = stringValue(call.getString("streamId")).trim();
        AgentEventStreamHandle stream = agentEventStreams.remove(streamId);
        if (stream != null) stream.stop();
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("stopped", stream != null);
        call.resolve(result);
    }

    @PluginMethod
    public void sendAgentEventStream(PluginCall call) {
        String streamId = stringValue(call.getString("streamId")).trim();
        JSObject message = call.getObject("message");
        AgentEventStreamHandle stream = agentEventStreams.get(streamId);
        if (stream == null || stream.stopped.get() || stream.socket == null) {
            call.reject("Agent WebSocket 当前不可用。", "AGENT_EVENT_NOT_OPEN");
            return;
        }
        String encoded = message == null ? "" : message.toString();
        if (encoded.isEmpty() || encoded.getBytes(StandardCharsets.UTF_8).length > 512 * 1024) {
            call.reject("Agent WebSocket 消息大小无效。", "AGENT_EVENT_MESSAGE_INVALID");
            return;
        }
        if (!stream.socket.send(encoded)) {
            call.reject("Agent WebSocket 消息发送失败。", "AGENT_EVENT_SEND_FAILED");
            return;
        }
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("streamId", streamId);
        call.resolve(result);
    }

    @PluginMethod
    public void agentUpload(PluginCall call) {
        String endpoint = stringValue(call.getString("endpoint")).trim();
        String accessToken = stringValue(call.getString("accessToken")).trim();
        String uploadId = stringValue(call.getString("uploadId")).trim();
        String workdir = stringValue(call.getString("workdir")).trim();
        String name = stringValue(call.getString("name")).trim();
        String mime = stringValue(call.getString("mime")).trim();
        String expectedFingerprint = stringValue(call.getString("tlsFingerprint"))
            .replaceFirst("(?i)^sha256/", "").trim();
        String encoded = stringValue(call.getString("base64")).replaceAll("\\s+", "");
        if (endpoint.isEmpty() || accessToken.isEmpty() || uploadId.isEmpty() || workdir.isEmpty() || encoded.isEmpty()) {
            call.reject("Agent 附件上传参数不完整。", "AGENT_UPLOAD_INVALID");
            return;
        }
        final byte[] content;
        try {
            content = Base64.decode(encoded, Base64.DEFAULT);
        } catch (Exception error) {
            call.reject("附件编码无效。", "AGENT_UPLOAD_INVALID", error);
            return;
        }
        if (call.getInt("size", content.length) != content.length) {
            call.reject("附件读取不完整，请重新选择文件。", "AGENT_UPLOAD_INVALID");
            return;
        }
        if (agentUploadConnections.containsKey(uploadId)) {
            call.reject("相同编号的附件正在上传。", "AGENT_UPLOAD_DUPLICATE");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL base = new URL(endpoint.endsWith("/") ? endpoint : endpoint + "/");
                URL url = new URL(base, "v1/files");
                if (!"https".equalsIgnoreCase(url.getProtocol()) || expectedFingerprint.isEmpty()) {
                    throw new IOException("Agent 安全上传必须使用带证书指纹的 HTTPS。");
                }
                connection = (HttpURLConnection) url.openConnection();
                configurePinnedHttps((HttpsURLConnection) connection, expectedFingerprint);
                int timeoutMs = Math.max(1_000, Math.min(call.getInt("timeoutMs", 240_000), 300_000));
                connection.setConnectTimeout(timeoutMs);
                connection.setReadTimeout(timeoutMs);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(content.length);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Authorization", "Bearer " + accessToken);
                connection.setRequestProperty("Content-Type", "application/octet-stream");
                connection.setRequestProperty("X-AIWB-Upload-Id", uploadId);
                connection.setRequestProperty("X-AIWB-Workdir", base64Url(workdir));
                connection.setRequestProperty("X-AIWB-File-Name", base64Url(name.isEmpty() ? "attachment.bin" : name));
                connection.setRequestProperty("X-AIWB-File-Mime", mime.isEmpty() ? "application/octet-stream" : mime);
                connection.setRequestProperty("X-AIWB-Content-SHA256", sha256Hex(content));
                agentUploadConnections.put(uploadId, connection);
                try (OutputStream output = connection.getOutputStream()) {
                    int offset = 0;
                    while (offset < content.length) {
                        if (cancelledAgentUploads.contains(uploadId)) throw new IOException("附件上传已取消。");
                        int count = Math.min(64 * 1024, content.length - offset);
                        output.write(content, offset, count);
                        offset += count;
                        JSObject progress = new JSObject();
                        progress.put("uploadId", uploadId);
                        progress.put("state", "uploading");
                        progress.put("bytesSent", offset);
                        progress.put("totalBytes", content.length);
                        progress.put("progress", content.length == 0 ? 1 : (double) offset / content.length);
                        notifyListeners("uploadProgress", progress);
                    }
                }
                int status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                JSObject result = new JSObject();
                result.put("status", status);
                result.put("body", stream == null ? "" : readStream(stream));
                call.resolve(result);
            } catch (Exception error) {
                String code = cancelledAgentUploads.contains(uploadId) ? "AGENT_UPLOAD_CANCELLED" : "AGENT_UPLOAD_FAILED";
                call.reject(cancelledAgentUploads.contains(uploadId) ? "附件上传已取消。" : safeError(error), code, error);
            } finally {
                agentUploadConnections.remove(uploadId);
                cancelledAgentUploads.remove(uploadId);
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void cancelAgentUpload(PluginCall call) {
        String uploadId = stringValue(call.getString("uploadId")).trim();
        HttpURLConnection connection = agentUploadConnections.get(uploadId);
        boolean active = connection != null;
        if (active) {
            cancelledAgentUploads.add(uploadId);
            connection.disconnect();
        }
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("cancelled", active);
        result.put("active", active);
        result.put("uploadId", uploadId);
        call.resolve(result);
    }

    @PluginMethod
    public void openTerminal(PluginCall call) {
        call.reject("请从当前会话右上角打开 SSH 终端。", "TERMINAL_USE_EMBEDDED");
    }

    @PluginMethod
    public void startTerminal(PluginCall call) {
        final TerminalConfig config;
        try {
            config = TerminalConfig.from(call);
        } catch (Exception error) {
            call.reject(safeError(error), "SSH_TERMINAL_INVALID", error);
            return;
        }

        closeTerminalSession(config.terminalId, false);
        emitTerminalState(config.terminalId, "connecting", "");
        appendDiagnosticLog("info", "ssh.android.terminal.start", objectOf(
            "terminalId", config.terminalId,
            "host", config.host,
            "port", config.port,
            "username", config.username,
            "platform", config.platform
        ));

        executor.execute(() -> {
            Session session = null;
            ChannelShell channel = null;
            TerminalSession terminal = null;
            boolean didResolve = false;

            try {
                session = createPinnedSession(
                    config.username,
                    config.password,
                    config.host,
                    config.port,
                    config.connectTimeoutSeconds,
                    config.sshHostKeyFingerprint,
                    15_000
                );

                channel = (ChannelShell) session.openChannel("shell");
                channel.setPty(true);
                channel.setPtyType("xterm-256color", config.cols, config.rows, 0, 0);
                channel.setEnv("TERM", "xterm-256color");
                InputStream input = channel.getInputStream();
                OutputStream output = channel.getOutputStream();
                channel.connect(config.connectTimeoutSeconds * 1000);

                terminal = new TerminalSession(
                    config.terminalId,
                    session,
                    channel,
                    input,
                    output
                );
                TerminalSession previous = terminalSessions.put(config.terminalId, terminal);
                if (previous != null && previous != terminal) previous.close();

                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("terminalId", config.terminalId);
                didResolve = true;
                call.resolve(result);
                emitTerminalState(config.terminalId, "connected", "");
                appendDiagnosticLog("info", "ssh.android.terminal.connected", objectOf(
                    "terminalId", config.terminalId,
                    "host", config.host,
                    "port", config.port
                ));

                if (!config.workdir.isEmpty()) {
                    String command = config.platform.contains("windows") && !config.platform.contains("wsl")
                        ? "Set-Location -LiteralPath " + powershellLiteral(config.workdir) + "\r"
                        : "cd -- " + shellLiteral(config.workdir) + "\r";
                    terminal.write(command.getBytes(StandardCharsets.UTF_8));
                }

                byte[] buffer = new byte[8192];
                while (!terminal.isClosed()) {
                    int count = input.read(buffer);
                    if (count < 0) break;
                    if (count > 0) emitTerminalData(config.terminalId, buffer, count);
                }

                if (terminalSessions.remove(config.terminalId, terminal)) {
                    emitTerminalState(config.terminalId, "closed", "远端 SSH 已断开");
                    appendDiagnosticLog("warn", "ssh.android.terminal.remote_closed", objectOf(
                        "terminalId", config.terminalId,
                        "host", config.host
                    ));
                }
            } catch (Exception error) {
                boolean wasActive = terminal != null && terminalSessions.remove(config.terminalId, terminal);
                String message = friendlyTerminalError(error);
                if (!didResolve) {
                    call.reject(message, "SSH_TERMINAL_FAILED", error);
                }
                if (!didResolve || wasActive) {
                    emitTerminalState(config.terminalId, "error", message);
                }
                appendDiagnosticLog("error", "ssh.android.terminal.failed", objectOf(
                    "terminalId", config.terminalId,
                    "host", config.host,
                    "port", config.port,
                    "error", message
                ));
            } finally {
                if (terminal != null) {
                    terminal.close();
                } else {
                    if (channel != null && channel.isConnected()) channel.disconnect();
                    if (session != null && session.isConnected()) session.disconnect();
                }
            }
        });
    }

    @PluginMethod
    public void writeTerminal(PluginCall call) {
        String terminalId = stringValue(call.getString("terminalId")).trim();
        String text = stringValue(call.getString("data"));
        String base64 = stringValue(call.getString("base64"));
        if (terminalId.isEmpty()) {
            call.reject("SSH 终端输入无效。", "SSH_TERMINAL_WRITE_INVALID");
            return;
        }

        final byte[] data;
        try {
            data = !base64.isEmpty()
                ? Base64.decode(base64, Base64.DEFAULT)
                : text.getBytes(StandardCharsets.UTF_8);
        } catch (Exception error) {
            call.reject("SSH 终端输入无效。", "SSH_TERMINAL_WRITE_INVALID", error);
            return;
        }

        executor.execute(() -> {
            try {
                TerminalSession terminal = requireTerminalSession(terminalId);
                terminal.write(data);
                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(friendlyTerminalError(error), "SSH_TERMINAL_WRITE_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void resizeTerminal(PluginCall call) {
        String terminalId = stringValue(call.getString("terminalId")).trim();
        int cols = clamp(intValue(call.getInt("cols"), 80), 20, 500);
        int rows = clamp(intValue(call.getInt("rows"), 24), 6, 300);
        if (terminalId.isEmpty()) {
            call.reject("SSH 终端会话不存在。", "SSH_TERMINAL_RESIZE_INVALID");
            return;
        }

        executor.execute(() -> {
            try {
                TerminalSession terminal = requireTerminalSession(terminalId);
                terminal.resize(cols, rows);
                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(friendlyTerminalError(error), "SSH_TERMINAL_RESIZE_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void closeTerminal(PluginCall call) {
        String terminalId = stringValue(call.getString("terminalId")).trim();
        if (!terminalId.isEmpty()) {
            closeTerminalSession(terminalId, true);
        }
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        try {
            String rawBase64 = stringValue(call.getString("base64"));
            if (rawBase64.trim().isEmpty()) {
                throw new IllegalArgumentException("Missing required field: base64");
            }
            String base64 = rawBase64.contains(",") ? rawBase64.substring(rawBase64.lastIndexOf(",") + 1) : rawBase64;
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            String name = safeFileName(call.getString("name", "download"));
            String mime = call.getString("mime", "application/octet-stream");
            File file = new File(getContext().getCacheDir(), name);
            try (FileOutputStream stream = new FileOutputStream(file)) {
                stream.write(data);
            }
            shareFile(file, mime);
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("path", file.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("保存文件失败：" + safeError(error), "FILE_SAVE_FAILED", error);
        }
    }

    @PluginMethod
    public void routeIntent(PluginCall call) {
        String apiKey = stringValue(call.getString("apiKey")).trim();
        JSObject requestBody = call.getObject("requestBody");
        int timeoutSeconds = clamp(intValue(call.getInt("timeoutSeconds"), 20), 5, 60);
        if (apiKey.isEmpty()) {
            call.reject("Missing required field: OpenAI API key", "OPENAI_CONFIG_INVALID");
            return;
        }
        if (requestBody == null) {
            call.reject("Missing required field: requestBody", "OPENAI_CONFIG_INVALID");
            return;
        }

        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL("https://api.openai.com/v1/responses");
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(timeoutSeconds * 1000);
                connection.setReadTimeout(timeoutSeconds * 1000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Authorization", "Bearer " + apiKey);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] body = requestBody.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream stream = connection.getOutputStream()) {
                    stream.write(body);
                }

                int status = connection.getResponseCode();
                InputStream responseStream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
                String responseBody = readFully(responseStream);
                if (status < 200 || status >= 300) {
                    throw new IOException("OpenAI request failed (" + status + "): " + clip(responseBody, 500));
                }
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("status", status);
                result.put("body", responseBody);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("主 AI 分流失败：" + safeError(error), "OPENAI_ROUTE_FAILED", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void saveProfile(PluginCall call) {
        try {
            JSObject profile = call.getObject("profile", new JSObject());
            getContext()
                .getSharedPreferences(PROFILE_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PROFILE_KEY, profile.toString())
                .apply();
            appendDiagnosticLog("info", "profile.android.save.success", profileSummary(profile));
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (Exception error) {
            appendDiagnosticLog("error", "profile.android.save.failed", objectOf("error", safeError(error)));
            call.reject("Could not save connection profile: " + safeError(error), "PROFILE_SAVE_FAILED", error);
        }
    }

    @PluginMethod
    public void loadProfile(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PROFILE_PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString(PROFILE_KEY, "");
            JSObject result = new JSObject();
            if (raw == null || raw.trim().isEmpty()) {
                appendDiagnosticLog("warn", "profile.android.load.missing", new JSObject());
                result.put("profile", new JSObject());
                call.resolve(result);
                return;
            }
            JSObject profile = new JSObject(raw);
            appendDiagnosticLog("info", "profile.android.load.success", profileSummary(profile));
            result.put("profile", profile);
            call.resolve(result);
        } catch (Exception error) {
            appendDiagnosticLog("error", "profile.android.load.failed", objectOf("error", safeError(error)));
            call.reject("Could not load connection profile: " + safeError(error), "PROFILE_LOAD_FAILED", error);
        }
    }

    @PluginMethod
    public void clearProfile(PluginCall call) {
        getContext().getSharedPreferences(PROFILE_PREFS, Context.MODE_PRIVATE).edit().remove(PROFILE_KEY).apply();
        appendDiagnosticLog("warn", "profile.android.clear", new JSObject());
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void appendLog(PluginCall call) {
        appendDiagnosticLog(
            call.getString("level", "info"),
            call.getString("event", "renderer.event"),
            call.getObject("fields", new JSObject())
        );
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        call.resolve(appInfoPayload());
    }

    @PluginMethod
    public void exportLogs(PluginCall call) {
        JSObject context = call.getObject("context", new JSObject());
        appendDiagnosticLog("info", "diagnostics.android.export.requested", context);
        executor.execute(() -> {
            try {
                File archive = buildDiagnosticsArchive(context);
                shareFile(archive, "application/zip");
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("path", archive.getAbsolutePath());
                result.put("name", archive.getName());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("导出诊断日志失败：" + safeError(error), "DIAGNOSTICS_EXPORT_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void clearLogs(PluginCall call) {
        executor.execute(() -> {
            try {
                File directory = ensureDiagnosticsDir();
                File[] files = directory.listFiles((dir, name) -> name.endsWith(".jsonl"));
                if (files != null) {
                    for (File file : files) {
                        if (!file.delete() && file.exists()) {
                            throw new IOException("Could not delete " + file.getName());
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("清空诊断日志失败：" + safeError(error), "DIAGNOSTICS_CLEAR_FAILED", error);
            }
        });
    }

    private String executeWithRetry(SSHConfig config, String requestId) throws Exception {
        try {
            return execute(config);
        } catch (Exception error) {
            if (!shouldRetry(error)) throw error;
            appendDiagnosticLog("warn", "ssh.android.retry", objectOf(
                "requestId", requestId,
                "host", config.host,
                "port", config.port,
                "error", safeError(error)
            ));
            Thread.sleep(350);
            return execute(config);
        }
    }

    private String execute(SSHConfig config) throws Exception {
        Session session = null;
        boolean persistent = !config.sessionId.isEmpty();
        try {
            session = persistent ? ensureCommandSession(config) : createCommandSession(config);

            if (config.uploadScript && !config.stdin.isEmpty()) {
                return runUploadedPowerShellScript(session, config);
            }
            return runExec(session, config.command, config.stdin, config.stdin.isEmpty(), config.commandTimeoutSeconds, config.maxResponseSize);
        } catch (Exception error) {
            if (persistent) {
                for (String affectedSessionId : invalidateCommandConnection(config.sessionId)) {
                    emitConnectionState(affectedSessionId, "error", friendlySSHError(error, config));
                }
            }
            throw error;
        } finally {
            if (!persistent && session != null && session.isConnected()) session.disconnect();
        }
    }

    private Session createCommandSession(SSHConfig config) throws Exception {
        return createPinnedSession(
            config.username,
            config.password,
            config.host,
            config.port,
            config.connectTimeoutSeconds,
            config.sshHostKeyFingerprint,
            10_000
        );
    }

    private Session createPinnedSession(
        String username,
        String password,
        String host,
        int port,
        int connectTimeoutSeconds,
        String expectedFingerprint,
        int serverAliveInterval
    ) throws Exception {
        JSch jsch = new JSch();
        FingerprintHostKeyRepository hostKeys = new FingerprintHostKeyRepository(expectedFingerprint);
        jsch.setHostKeyRepository(hostKeys);
        Session session = jsch.getSession(username, host, port);
        session.setPassword(password);
        Properties props = new Properties();
        props.put("StrictHostKeyChecking", "yes");
        props.put("PreferredAuthentications", "password,keyboard-interactive");
        session.setConfig(props);
        session.setServerAliveInterval(serverAliveInterval);
        session.setServerAliveCountMax(3);
        try {
            session.connect(connectTimeoutSeconds * 1000);
            return session;
        } catch (Exception error) {
            if (session.isConnected()) session.disconnect();
            String trustError = hostKeys.trustError();
            if (!trustError.isEmpty()) throw new HostKeyValidationException(trustError, error);
            throw error;
        }
    }

    private Session ensureCommandSession(SSHConfig config) throws Exception {
        String fingerprint = config.connectionFingerprint();
        synchronized (commandConnectionLock) {
            String previousFingerprint = commandSessionFingerprints.get(config.sessionId);
            if (fingerprint.equals(previousFingerprint)) {
                PooledCommandConnection existing = commandConnections.get(fingerprint);
                if (existing != null && existing.session.isConnected()) {
                    existing.attach(config.sessionId);
                    return existing.session;
                }
            }
            if (previousFingerprint != null) detachCommandSessionLocked(config.sessionId, false);
            PooledCommandConnection pooled = commandConnections.get(fingerprint);
            if (pooled != null && pooled.session.isConnected()) {
                pooled.attach(config.sessionId);
                commandSessionFingerprints.put(config.sessionId, fingerprint);
                return pooled.session;
            }
            if (pooled != null) {
                commandConnections.remove(fingerprint, pooled);
                pooled.close();
            }
        }

        Session connected = createCommandSession(config);
        synchronized (commandConnectionLock) {
            PooledCommandConnection pooled = commandConnections.get(fingerprint);
            if (pooled != null && pooled.session.isConnected()) {
                connected.disconnect();
                pooled.attach(config.sessionId);
                commandSessionFingerprints.put(config.sessionId, fingerprint);
                return pooled.session;
            }
            PooledCommandConnection created = new PooledCommandConnection(connected);
            created.attach(config.sessionId);
            commandConnections.put(fingerprint, created);
            commandSessionFingerprints.put(config.sessionId, fingerprint);
            return connected;
        }
    }

    private boolean detachCommandSession(String sessionId, boolean preserveTransport) {
        synchronized (commandConnectionLock) {
            return detachCommandSessionLocked(sessionId, preserveTransport);
        }
    }

    private boolean detachCommandSessionLocked(String sessionId, boolean preserveTransport) {
        String fingerprint = commandSessionFingerprints.remove(sessionId);
        if (fingerprint == null) return false;
        PooledCommandConnection connection = commandConnections.get(fingerprint);
        if (connection == null) return true;
        connection.sessionIds.remove(sessionId);
        if (!connection.sessionIds.isEmpty()) return true;
        if (!preserveTransport) {
            commandConnections.remove(fingerprint, connection);
            connection.close();
            return true;
        }
        connection.scheduleIdleClose(() -> {
            synchronized (commandConnectionLock) {
                PooledCommandConnection current = commandConnections.get(fingerprint);
                if (current != connection || !connection.sessionIds.isEmpty()) return;
                commandConnections.remove(fingerprint, connection);
                connection.close();
            }
        });
        return true;
    }

    private Set<String> invalidateCommandConnection(String sessionId) {
        synchronized (commandConnectionLock) {
            String fingerprint = commandSessionFingerprints.get(sessionId);
            if (fingerprint == null) {
                Set<String> fallback = new HashSet<>();
                fallback.add(sessionId);
                return fallback;
            }
            PooledCommandConnection connection = commandConnections.remove(fingerprint);
            if (connection == null) {
                commandSessionFingerprints.remove(sessionId);
                Set<String> fallback = new HashSet<>();
                fallback.add(sessionId);
                return fallback;
            }
            Set<String> affectedSessionIds = new HashSet<>(connection.sessionIds);
            for (String affectedSessionId : affectedSessionIds) {
                commandSessionFingerprints.remove(affectedSessionId, fingerprint);
            }
            connection.close();
            return affectedSessionIds;
        }
    }

    private String runUploadedPowerShellScript(Session session, SSHConfig config) throws Exception {
        String tempOutput = runExec(
            session,
            "powershell -NoLogo -NoProfile -Command \"[System.IO.Path]::GetTempPath()\"",
            "",
            false,
            Math.min(config.commandTimeoutSeconds, 30),
            16_384
        );
        String tempDir = "C:\\Windows\\Temp";
        for (String line : tempOutput.split("\\r?\\n")) {
            String trimmed = line.trim();
            if (trimmed.matches("^[A-Za-z]:[\\\\/].*")) {
                tempDir = trimmed.replaceAll("[\\\\/]+$", "");
                break;
            }
        }
        String remotePath = tempDir + "\\aiwb-" + System.currentTimeMillis() + "-" + UUID.randomUUID() + ".ps1";
        byte[] script = withUtf8Bom(config.stdin.endsWith("\n") ? config.stdin : config.stdin + "\n");

        ChannelSftp sftp = null;
        try {
            Channel channel = session.openChannel("sftp");
            channel.connect(config.connectTimeoutSeconds * 1000);
            sftp = (ChannelSftp) channel;
            try (ByteArrayInputStream input = new ByteArrayInputStream(script)) {
                sftp.put(input, remotePath.replace("\\", "/"));
            }
        } finally {
            if (sftp != null && sftp.isConnected()) sftp.disconnect();
        }

        String quotedPath = powershellLiteral(remotePath);
        String wrapper = "& " + quotedPath + "; $AIWB_EXIT=$LASTEXITCODE; Remove-Item -LiteralPath " + quotedPath
            + " -Force -ErrorAction SilentlyContinue; if ($null -ne $AIWB_EXIT) { exit $AIWB_EXIT }";
        String encoded = Base64.encodeToString(wrapper.getBytes(StandardCharsets.UTF_16LE), Base64.NO_WRAP);
        return runExec(
            session,
            "powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand " + encoded,
            "",
            false,
            config.commandTimeoutSeconds,
            config.maxResponseSize
        );
    }

    private String runExec(Session session, String command, String stdin, boolean pty, int timeoutSeconds, int maxResponseSize) throws Exception {
        ChannelExec channel = null;
        try {
            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            channel.setPty(pty);
            if (!stdin.isEmpty()) {
                String inputText = stdin.endsWith("\n") ? stdin : stdin + "\n";
                channel.setInputStream(new ByteArrayInputStream(inputText.getBytes(StandardCharsets.UTF_8)));
            } else {
                channel.setInputStream(null);
            }

            InputStream stdout = channel.getInputStream();
            InputStream stderr = channel.getErrStream();
            BoundedOutput output = new BoundedOutput(maxResponseSize);
            long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
            channel.connect();

            byte[] buffer = new byte[8192];
            while (true) {
                boolean readAny = false;
                while (stdout.available() > 0) {
                    int count = stdout.read(buffer);
                    if (count < 0) break;
                    output.append(buffer, count);
                    readAny = true;
                }
                while (stderr.available() > 0) {
                    int count = stderr.read(buffer);
                    if (count < 0) break;
                    output.append(buffer, count);
                    readAny = true;
                }
                if (channel.isClosed()) {
                    while (stdout.available() > 0) {
                        int count = stdout.read(buffer);
                        if (count < 0) break;
                        output.append(buffer, count);
                    }
                    while (stderr.available() > 0) {
                        int count = stderr.read(buffer);
                        if (count < 0) break;
                        output.append(buffer, count);
                    }
                    return output.asString();
                }
                if (System.currentTimeMillis() > deadline) {
                    throw new IOException("SSH command timed out");
                }
                if (!readAny) Thread.sleep(35);
            }
        } finally {
            if (channel != null && channel.isConnected()) channel.disconnect();
        }
    }

    private File buildDiagnosticsArchive(JSObject context) throws Exception {
        File diagnosticsDir = ensureDiagnosticsDir();
        File[] logFiles = diagnosticsDir.listFiles((dir, name) -> name.endsWith(".jsonl"));
        List<File> logs = new ArrayList<>();
        if (logFiles != null) {
            for (File file : logFiles) logs.add(file);
            logs.sort((left, right) -> left.getName().compareTo(right.getName()));
            while (logs.size() > 14) logs.remove(0);
        }

        File archive = new File(
            getContext().getCacheDir(),
            "AI-Workbench-diagnostics-" + isoStamp().replace(":", "-") + ".zip"
        );
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(archive))) {
            JSObject metadata = new JSObject();
            metadata.put("exportedAt", isoStamp());
            metadata.put("platform", "android");
            JSObject appInfo = appInfoPayload();
            metadata.put("appVersion", appInfo.optString("version", ""));
            metadata.put("build", appInfo.optString("build", ""));
            metadata.put("app", appInfo);
            metadata.put("context", sanitizeJson(context, 0));
            String rawProfile = getContext().getSharedPreferences(PROFILE_PREFS, Context.MODE_PRIVATE).getString(PROFILE_KEY, "");
            metadata.put("storedProfileBytes", rawProfile == null ? 0 : rawProfile.length());
            if (rawProfile != null && !rawProfile.isEmpty()) {
                try {
                    metadata.put("storedProfileSummary", profileSummary(new JSObject(rawProfile)));
                } catch (JSONException ignored) {
                    metadata.put("storedProfileSummary", "unreadable");
                }
            }
            writeZipEntry(zip, "diagnostics.json", metadata.toString(2).getBytes(StandardCharsets.UTF_8));

            for (File log : logs) {
                writeZipEntry(zip, "logs/" + log.getName(), readAllBytes(log));
            }
        }
        return archive;
    }

    private JSObject appInfoPayload() {
        JSObject info = new JSObject();
        String version = "";
        String build = "";
        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            version = packageInfo.versionName == null ? "" : packageInfo.versionName;
            build = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? String.valueOf(packageInfo.getLongVersionCode())
                : String.valueOf(packageInfo.versionCode);
        } catch (Exception ignored) {
            // Keep the response useful even if PackageManager is unavailable.
        }
        info.put("name", "AI Workbench");
        info.put("version", version);
        info.put("build", build);
        info.put("displayVersion", !build.isEmpty() && !build.equals(version) ? version + " (" + build + ")" : version);
        info.put("bundleIdentifier", getContext().getPackageName());
        info.put("platform", "android");
        info.put("device", Build.MODEL == null ? "" : Build.MODEL);
        info.put("systemVersion", Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE);
        info.put("packaged", true);
        return info;
    }

    private void shareFile(File file, String mime) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType(mime == null || mime.trim().isEmpty() ? "application/octet-stream" : mime);
        intent.putExtra(Intent.EXTRA_STREAM, uri);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(intent, "分享文件");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
    }

    private void appendDiagnosticLog(String level, String event, JSObject fields) {
        executor.execute(() -> {
            try {
                File directory = ensureDiagnosticsDir();
                File file = new File(directory, "ai-workbench-" + dayStamp() + ".jsonl");
                JSObject entry = new JSObject();
                entry.put("ts", isoStamp());
                entry.put("level", stringValue(level).isEmpty() ? "info" : level);
                entry.put("event", stringValue(event).isEmpty() ? "app.event" : event);
                entry.put("fields", sanitizeJson(fields, 0));
                try (FileOutputStream stream = new FileOutputStream(file, true)) {
                    stream.write(entry.toString().getBytes(StandardCharsets.UTF_8));
                    stream.write('\n');
                }
                trimDiagnosticLogs(directory);
            } catch (Exception error) {
                android.util.Log.w("AIWorkbench", safeError(error));
            }
        });
    }

    private TerminalSession requireTerminalSession(String terminalId) throws IOException {
        TerminalSession terminal = terminalSessions.get(terminalId);
        if (terminal == null || terminal.isClosed()) {
            throw new IOException("Connection closed");
        }
        return terminal;
    }

    private void closeTerminalSession(String terminalId, boolean emitState) {
        TerminalSession terminal = terminalSessions.remove(terminalId);
        if (terminal != null) terminal.close();
        if (emitState) emitTerminalState(terminalId, "closed", "SSH 连接已关闭");
    }

    private void emitTerminalData(String terminalId, byte[] buffer, int length) {
        JSObject payload = new JSObject();
        payload.put("terminalId", terminalId);
        payload.put(
            "base64",
            Base64.encodeToString(Arrays.copyOf(buffer, length), Base64.NO_WRAP)
        );
        notifyTerminalListeners("terminalData", payload);
    }

    private void emitTerminalState(String terminalId, String state, String detail) {
        JSObject payload = new JSObject();
        payload.put("terminalId", terminalId);
        payload.put("state", state);
        payload.put("detail", detail);
        notifyTerminalListeners("terminalState", payload);
    }

    private void emitConnectionState(String sessionId, String state, String detail) {
        JSObject payload = new JSObject();
        payload.put("sessionId", sessionId);
        payload.put("state", state);
        payload.put("detail", detail);
        notifyListeners("connectionState", payload);
    }

    private void notifyTerminalListeners(String event, JSObject payload) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> notifyListeners(event, payload));
            return;
        }
        notifyListeners(event, payload);
    }

    private static String friendlyTerminalError(Exception error) {
        String message = safeError(error);
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("auth fail") || lower.contains("authentication") || lower.contains("permission denied")) {
            return "Authentication failed：请检查用户名和登录密码。";
        }
        if (lower.contains("timed out") || lower.contains("timeout")) {
            return "Timed out while waiting for handshake";
        }
        if (lower.contains("refused")) {
            return "Connection refused";
        }
        if (lower.contains("unknownhost") || lower.contains("unknown host")) {
            return "getaddrinfo ENOTFOUND";
        }
        if (lower.contains("socket closed") || lower.contains("channel closed") || lower.contains("eof")) {
            return "Connection closed";
        }
        return message;
    }

    private File ensureDiagnosticsDir() {
        File directory = new File(getContext().getFilesDir(), "AIWorkbenchDiagnostics");
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private void trimDiagnosticLogs(File directory) {
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".jsonl"));
        if (files == null || files.length <= 14) return;
        List<File> logs = new ArrayList<>();
        for (File file : files) logs.add(file);
        logs.sort((left, right) -> left.getName().compareTo(right.getName()));
        for (int index = 0; index < logs.size() - 14; index += 1) {
            //noinspection ResultOfMethodCallIgnored
            logs.get(index).delete();
        }
    }

    private JSObject profileSummary(JSObject profile) {
        JSObject result = new JSObject();
        JSONArray servers = profile.optJSONArray("servers");
        result.put("version", profile.optInt("version", 0));
        result.put("activeServerId", profile.optString("activeServerId", ""));
        result.put("serverCount", servers == null ? 0 : servers.length());
        JSONArray items = new JSONArray();
        if (servers != null) {
            for (int index = 0; index < servers.length(); index += 1) {
                JSONObject server = servers.optJSONObject(index);
                if (server == null) continue;
                JSONObject itemProfile = server.optJSONObject("profile");
                if (itemProfile == null) itemProfile = new JSONObject();
                JSObject item = new JSObject();
                item.put("index", index + 1);
                item.put("id", server.optString("id", ""));
                item.put("name", firstNonEmpty(server.optString("name", ""), itemProfile.optString("name", "")));
                item.put("agentId", itemProfile.optString("agentId", ""));
                item.put("platform", itemProfile.optString("platform", ""));
                item.put("host", itemProfile.optString("host", ""));
                item.put("port", itemProfile.optInt("port", 22));
                item.put("username", itemProfile.optString("username", ""));
                item.put("workdir", itemProfile.optString("workdir", ""));
                item.put("hasPassword", !itemProfile.optString("password", "").isEmpty());
                item.put("passwordLength", itemProfile.optString("password", "").length());
                items.put(item);
            }
        }
        result.put("servers", items);
        return result;
    }

    private Object sanitizeJson(Object value, int depth) {
        if (depth > 4) return "[depth-limit]";
        if (value == null || value == JSONObject.NULL) return JSONObject.NULL;
        if (value instanceof String) {
            String text = (String) value;
            return text.length() > 600 ? text.substring(0, 600) + "...[truncated:" + text.length() + "]" : text;
        }
        if (value instanceof Number || value instanceof Boolean) return value;
        if (value instanceof JSONArray) {
            JSONArray input = (JSONArray) value;
            JSONArray output = new JSONArray();
            int count = Math.min(input.length(), 80);
            for (int index = 0; index < count; index += 1) output.put(sanitizeJson(input.opt(index), depth + 1));
            return output;
        }
        if (value instanceof JSONObject) {
            JSONObject input = (JSONObject) value;
            JSObject output = new JSObject();
            Iterator<String> keys = input.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (isSensitiveKey(key)) output.put(key, "[redacted]");
                else if (isNoisyKey(key)) output.put(key, "[omitted]");
                else output.put(key, sanitizeJson(input.opt(key), depth + 1));
            }
            return output;
        }
        return String.valueOf(value);
    }

    private boolean isSensitiveKey(String key) {
        String lower = stringValue(key).toLowerCase(Locale.ROOT);
        return lower.contains("password")
            || lower.contains("token")
            || lower.contains("secret")
            || lower.contains("accesskey")
            || lower.contains("apikey")
            || lower.contains("api_key")
            || lower.contains("authorization")
            || lower.contains("credential")
            || lower.contains("base64");
    }

    private boolean isNoisyKey(String key) {
        String lower = stringValue(key).toLowerCase(Locale.ROOT);
        return lower.equals("body")
            || lower.equals("output")
            || lower.equals("stdout")
            || lower.equals("stderr")
            || lower.equals("requestbody")
            || lower.equals("rawoutput")
            || lower.equals("messages")
            || lower.equals("transcript");
    }

    private boolean shouldRetry(Exception error) {
        String message = safeError(error).toLowerCase(Locale.ROOT);
        if (message.contains("auth") || message.contains("password") || message.contains("permission denied")) return false;
        return message.contains("connection reset")
            || message.contains("connection closed")
            || message.contains("channel closed")
            || message.contains("timed out")
            || message.contains("eof");
    }

    private static JSObject objectOf(Object... pairs) {
        JSObject object = new JSObject();
        for (int index = 0; index + 1 < pairs.length; index += 2) {
            object.put(String.valueOf(pairs[index]), pairs[index + 1]);
        }
        return object;
    }

    private static String powershellLiteral(String value) {
        return "'" + stringValue(value).replace("'", "''") + "'";
    }

    private static String shellLiteral(String value) {
        return "'" + stringValue(value).replace("'", "'\"'\"'") + "'";
    }

    private static byte[] withUtf8Bom(String value) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(0xef);
        output.write(0xbb);
        output.write(0xbf);
        output.write(value.getBytes(StandardCharsets.UTF_8));
        return output.toByteArray();
    }

    private static String readFully(InputStream stream) throws IOException {
        if (stream == null) return "";
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) >= 0) output.write(buffer, 0, count);
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private static byte[] readAllBytes(File file) throws IOException {
        try (InputStream input = new java.io.FileInputStream(file)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private static void writeZipEntry(ZipOutputStream zip, String name, byte[] data) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(data);
        zip.closeEntry();
    }

    private static String dayStamp() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        return format.format(new Date());
    }

    private static String isoStamp() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static String safeFileName(String value) {
        String name = stringValue(value).trim().replaceAll("[\\\\/:\\u0000]", "-").replaceAll("^\\.+$", "download");
        if (name.isEmpty()) return "download";
        return name.length() > 180 ? name.substring(0, 180) : name;
    }

    private static String firstNonEmpty(String first, String second) {
        return !stringValue(first).trim().isEmpty() ? first : stringValue(second);
    }

    private static String clip(String value, int max) {
        String text = stringValue(value);
        return text.length() <= max ? text : text.substring(0, max);
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static int intValue(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private static String stringValue(String value) {
        return value == null ? "" : value;
    }

    private static String safeError(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) message = error.toString();
        return message.replace("\n", " ");
    }

    private static final class HostKeyValidationException extends JSchException {
        HostKeyValidationException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private static final class FingerprintHostKeyRepository implements HostKeyRepository {
        private final String expectedFingerprint;
        private volatile String error = "";

        FingerprintHostKeyRepository(String expectedFingerprint) {
            this.expectedFingerprint = stringValue(expectedFingerprint).trim();
        }

        @Override
        public int check(String host, byte[] key) {
            String presented = "sha256/" + Base64.encodeToString(sha256(key), Base64.NO_WRAP);
            if (expectedFingerprint.isEmpty()) {
                error = "SSH_HOST_KEY_UNTRUSTED:" + presented;
                return HostKeyRepository.NOT_INCLUDED;
            }
            if (!MessageDigest.isEqual(expectedFingerprint.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8))) {
                error = "SSH_HOST_KEY_CHANGED:" + presented;
                return HostKeyRepository.CHANGED;
            }
            return HostKeyRepository.OK;
        }

        @Override public void add(HostKey hostkey, UserInfo ui) { }
        @Override public void remove(String host, String type) { }
        @Override public void remove(String host, String type, byte[] key) { }
        @Override public String getKnownHostsRepositoryID() { return "AI Workbench pinned host"; }
        @Override public HostKey[] getHostKey() { return new HostKey[0]; }
        @Override public HostKey[] getHostKey(String host, String type) { return new HostKey[0]; }

        String trustError() {
            return error;
        }

        private static byte[] sha256(byte[] value) {
            try {
                return MessageDigest.getInstance("SHA-256").digest(value);
            } catch (Exception error) {
                throw new IllegalStateException("Unable to calculate SSH host key fingerprint.", error);
            }
        }
    }

    private static String readStream(InputStream stream) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8_192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String base64Url(String value) {
        return Base64.encodeToString(value.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static String sha256Hex(byte[] value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte item : digest) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return result.toString();
    }

    private static void configurePinnedHttps(HttpsURLConnection connection, String expectedFingerprint) throws Exception {
        final byte[] expected = Base64.decode(expectedFingerprint, Base64.DEFAULT);
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[] { new X509TrustManager() {
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
            @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            @Override public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                try {
                    if (chain == null || chain.length == 0) throw new CertificateException("Agent TLS 证书缺失。");
                    byte[] actual = MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());
                    if (!MessageDigest.isEqual(expected, actual)) {
                        throw new CertificateException("Agent TLS 证书指纹不匹配，已阻止连接。");
                    }
                } catch (CertificateException error) {
                    throw error;
                } catch (Exception error) {
                    throw new CertificateException("Agent TLS 证书校验失败。", error);
                }
            }
        } }, new SecureRandom());
        connection.setSSLSocketFactory(context.getSocketFactory());
        // The pinned leaf certificate is the identity check. Agent certificates
        // use a stable product CN, not the server's changing LAN/IP address.
        connection.setHostnameVerifier((hostname, session) -> true);
    }

    private static String friendlySSHError(Exception error, SSHConfig config) {
        String raw = safeError(error);
        String message = raw.toLowerCase(Locale.ROOT);
        if (raw.startsWith("SSH_HOST_KEY_UNTRUSTED:") || raw.startsWith("SSH_HOST_KEY_CHANGED:")) {
            return raw;
        }
        if (message.contains("auth fail") || message.contains("authentication") || message.contains("password")) {
            return "SSH 登录失败：请检查用户名和登录密码。";
        }
        if (message.contains("refused")) {
            return "连接被拒绝：请确认 SSH 已开启，并且端口 " + config.port + " 没有被防火墙拦截。";
        }
        if (message.contains("timeout") || message.contains("timed out")) {
            return "SSH 连接超时：请确认网络可达并稍后重试。";
        }
        return raw;
    }

    private final class PooledCommandConnection {
        final Session session;
        final Set<String> sessionIds = ConcurrentHashMap.newKeySet();
        volatile ScheduledFuture<?> idleCloseTask;

        PooledCommandConnection(Session session) {
            this.session = session;
        }

        void attach(String sessionId) {
            ScheduledFuture<?> task = idleCloseTask;
            if (task != null) task.cancel(false);
            idleCloseTask = null;
            sessionIds.add(sessionId);
        }

        void scheduleIdleClose(Runnable closeAction) {
            ScheduledFuture<?> task = idleCloseTask;
            if (task != null) task.cancel(false);
            idleCloseTask = connectionScheduler.schedule(closeAction, 30, TimeUnit.SECONDS);
        }

        void close() {
            ScheduledFuture<?> task = idleCloseTask;
            if (task != null) task.cancel(false);
            idleCloseTask = null;
            sessionIds.clear();
            if (session.isConnected()) session.disconnect();
        }
    }

    private static class SSHConfig {
        final String sessionId;
        final String host;
        final String username;
        final String password;
        final String command;
        final String stdin;
        final String sshHostKeyFingerprint;
        final boolean uploadScript;
        final int port;
        final int connectTimeoutSeconds;
        final int commandTimeoutSeconds;
        final int maxResponseSize;

        private SSHConfig(
            String sessionId,
            String host,
            String username,
            String password,
            String command,
            String stdin,
            String sshHostKeyFingerprint,
            boolean uploadScript,
            int port,
            int connectTimeoutSeconds,
            int commandTimeoutSeconds,
            int maxResponseSize
        ) {
            this.sessionId = sessionId;
            this.host = host;
            this.username = username;
            this.password = password;
            this.command = command;
            this.stdin = stdin;
            this.sshHostKeyFingerprint = sshHostKeyFingerprint;
            this.uploadScript = uploadScript;
            this.port = port;
            this.connectTimeoutSeconds = connectTimeoutSeconds;
            this.commandTimeoutSeconds = commandTimeoutSeconds;
            this.maxResponseSize = maxResponseSize;
        }

        String connectionFingerprint() {
            return host + "\u0000" + port + "\u0000" + username + "\u0000" + password + "\u0000" + sshHostKeyFingerprint;
        }

        static SSHConfig from(PluginCall call) {
            String host = stringValue(call.getString("host")).trim();
            String username = stringValue(call.getString("username")).trim();
            String password = stringValue(call.getString("password"));
            String command = stringValue(call.getString("command")).trim();
            String stdin = stringValue(call.getString("stdin"));
            boolean uploadScript = Boolean.TRUE.equals(call.getBoolean("uploadScript", false));

            if (host.isEmpty()) throw new IllegalArgumentException("Missing required field: host");
            if (username.isEmpty()) throw new IllegalArgumentException("Missing required field: username");
            if (password.isEmpty()) throw new IllegalArgumentException("Missing required field: password");
            if (command.isEmpty()) throw new IllegalArgumentException("Missing required field: command");

            return new SSHConfig(
                stringValue(call.getString("sessionId")).trim(),
                host,
                username,
                password,
                command,
                stdin,
                stringValue(call.getString("sshHostKeyFingerprint")).trim(),
                uploadScript,
                clamp(intValue(call.getInt("port"), 22), 1, 65_535),
                clamp(intValue(call.getInt("connectTimeoutSeconds"), 15), 3, 60),
                clamp(intValue(call.getInt("commandTimeoutSeconds"), 180), 5, 7200),
                clamp(intValue(call.getInt("maxResponseSize"), 1_048_576), 1024, MAX_RESPONSE_LIMIT)
            );
        }

        static SSHConfig fromConnection(PluginCall call) {
            String sessionId = stringValue(call.getString("sessionId")).trim();
            String host = stringValue(call.getString("host")).trim();
            String username = stringValue(call.getString("username")).trim();
            String password = stringValue(call.getString("password"));
            if (sessionId.isEmpty()) throw new IllegalArgumentException("Missing required field: sessionId");
            if (host.isEmpty()) throw new IllegalArgumentException("Missing required field: host");
            if (username.isEmpty()) throw new IllegalArgumentException("Missing required field: username");
            if (password.isEmpty()) throw new IllegalArgumentException("Missing required field: password");
            return new SSHConfig(
                sessionId,
                host,
                username,
                password,
                "true",
                "",
                stringValue(call.getString("sshHostKeyFingerprint")).trim(),
                false,
                clamp(intValue(call.getInt("port"), 22), 1, 65_535),
                clamp(intValue(call.getInt("connectTimeoutSeconds"), 15), 3, 60),
                30,
                16_384
            );
        }
    }

    private static class TerminalConfig {
        final String terminalId;
        final String host;
        final String username;
        final String password;
        final String platform;
        final String workdir;
        final String sshHostKeyFingerprint;
        final int port;
        final int connectTimeoutSeconds;
        final int cols;
        final int rows;

        private TerminalConfig(
            String terminalId,
            String host,
            String username,
            String password,
            String platform,
            String workdir,
            String sshHostKeyFingerprint,
            int port,
            int connectTimeoutSeconds,
            int cols,
            int rows
        ) {
            this.terminalId = terminalId;
            this.host = host;
            this.username = username;
            this.password = password;
            this.platform = platform;
            this.workdir = workdir;
            this.sshHostKeyFingerprint = sshHostKeyFingerprint;
            this.port = port;
            this.connectTimeoutSeconds = connectTimeoutSeconds;
            this.cols = cols;
            this.rows = rows;
        }

        static TerminalConfig from(PluginCall call) {
            String terminalId = stringValue(call.getString("terminalId")).trim();
            String host = stringValue(call.getString("host")).trim();
            String username = stringValue(call.getString("username")).trim();
            String password = stringValue(call.getString("password"));

            if (terminalId.isEmpty()) throw new IllegalArgumentException("Missing required field: terminalId");
            if (host.isEmpty()) throw new IllegalArgumentException("Missing required field: host");
            if (username.isEmpty()) throw new IllegalArgumentException("Missing required field: username");
            if (password.isEmpty()) throw new IllegalArgumentException("Missing required field: password");

            return new TerminalConfig(
                terminalId,
                host,
                username,
                password,
                stringValue(call.getString("platform", "linux")).trim().toLowerCase(Locale.ROOT),
                stringValue(call.getString("workdir")).trim(),
                stringValue(call.getString("sshHostKeyFingerprint")).trim(),
                clamp(intValue(call.getInt("port"), 22), 1, 65_535),
                clamp(intValue(call.getInt("connectTimeoutSeconds"), 15), 3, 60),
                clamp(intValue(call.getInt("cols"), 80), 20, 500),
                clamp(intValue(call.getInt("rows"), 24), 6, 300)
            );
        }
    }

    private static class TerminalSession {
        final String terminalId;
        final Session session;
        final ChannelShell channel;
        final InputStream input;
        final OutputStream output;
        final Object writeLock = new Object();
        final AtomicBoolean closed = new AtomicBoolean(false);

        TerminalSession(
            String terminalId,
            Session session,
            ChannelShell channel,
            InputStream input,
            OutputStream output
        ) {
            this.terminalId = terminalId;
            this.session = session;
            this.channel = channel;
            this.input = input;
            this.output = output;
        }

        boolean isClosed() {
            return closed.get() || !channel.isConnected() || channel.isClosed();
        }

        void write(byte[] data) throws IOException {
            if (isClosed()) throw new IOException("Connection closed");
            synchronized (writeLock) {
                if (isClosed()) throw new IOException("Connection closed");
                output.write(data);
                output.flush();
            }
        }

        void resize(int cols, int rows) throws IOException {
            if (isClosed()) throw new IOException("Connection closed");
            channel.setPtySize(cols, rows, 0, 0);
        }

        void close() {
            if (!closed.compareAndSet(false, true)) return;
            try {
                channel.disconnect();
            } catch (Exception ignored) {
                // Best effort close.
            }
            try {
                session.disconnect();
            } catch (Exception ignored) {
                // Best effort close.
            }
            try {
                input.close();
            } catch (Exception ignored) {
                // Best effort close.
            }
            try {
                output.close();
            } catch (Exception ignored) {
                // Best effort close.
            }
        }
    }

    private static class BoundedOutput {
        private final int max;
        private final ByteArrayOutputStream output = new ByteArrayOutputStream();

        BoundedOutput(int max) {
            this.max = Math.max(1024, max);
        }

        void append(byte[] buffer, int length) throws IOException {
            if (length <= 0) return;
            if (output.size() + length <= max) {
                output.write(buffer, 0, length);
                return;
            }
            if (length >= max) {
                output.reset();
                output.write(buffer, length - max, max);
                return;
            }
            byte[] current = output.toByteArray();
            int keep = Math.max(0, max - length);
            output.reset();
            if (current.length > keep) output.write(current, current.length - keep, keep);
            else output.write(current);
            output.write(buffer, 0, length);
        }

        String asString() {
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
