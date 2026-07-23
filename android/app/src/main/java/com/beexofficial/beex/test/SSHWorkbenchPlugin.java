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
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;

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
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@CapacitorPlugin(name = "SSHWorkbench")
public class SSHWorkbenchPlugin extends Plugin {
    private static final String PROFILE_PREFS = "ai_workbench_profile";
    private static final String PROFILE_KEY = "profile";
    private static final int MAX_RESPONSE_LIMIT = 83_886_080;
    private final ExecutorService executor = Executors.newCachedThreadPool();

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
                call.reject("SSH command failed: " + safeError(error), "SSH_COMMAND_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void openTerminal(PluginCall call) {
        call.reject("Android 端暂不支持打开系统 SSH 终端，请直接在聊天窗口或设置页执行。", "TERMINAL_UNSUPPORTED");
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
        try {
            JSch jsch = new JSch();
            session = jsch.getSession(config.username, config.host, config.port);
            session.setPassword(config.password);
            Properties props = new Properties();
            props.put("StrictHostKeyChecking", "no");
            props.put("PreferredAuthentications", "password,keyboard-interactive");
            session.setConfig(props);
            session.connect(config.connectTimeoutSeconds * 1000);

            if (config.uploadScript && !config.stdin.isEmpty()) {
                return runUploadedPowerShellScript(session, config);
            }
            return runExec(session, config.command, config.stdin, config.stdin.isEmpty(), config.commandTimeoutSeconds, config.maxResponseSize);
        } finally {
            if (session != null && session.isConnected()) session.disconnect();
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

    private static class SSHConfig {
        final String host;
        final String username;
        final String password;
        final String command;
        final String stdin;
        final boolean uploadScript;
        final int port;
        final int connectTimeoutSeconds;
        final int commandTimeoutSeconds;
        final int maxResponseSize;

        private SSHConfig(
            String host,
            String username,
            String password,
            String command,
            String stdin,
            boolean uploadScript,
            int port,
            int connectTimeoutSeconds,
            int commandTimeoutSeconds,
            int maxResponseSize
        ) {
            this.host = host;
            this.username = username;
            this.password = password;
            this.command = command;
            this.stdin = stdin;
            this.uploadScript = uploadScript;
            this.port = port;
            this.connectTimeoutSeconds = connectTimeoutSeconds;
            this.commandTimeoutSeconds = commandTimeoutSeconds;
            this.maxResponseSize = maxResponseSize;
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
                host,
                username,
                password,
                command,
                stdin,
                uploadScript,
                clamp(intValue(call.getInt("port"), 22), 1, 65_535),
                clamp(intValue(call.getInt("connectTimeoutSeconds"), 15), 3, 60),
                clamp(intValue(call.getInt("commandTimeoutSeconds"), 180), 5, 7200),
                clamp(intValue(call.getInt("maxResponseSize"), 1_048_576), 1024, MAX_RESPONSE_LIMIT)
            );
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
