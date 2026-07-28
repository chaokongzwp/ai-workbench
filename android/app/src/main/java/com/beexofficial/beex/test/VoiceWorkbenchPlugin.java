package com.beexofficial.beex.test;

import android.Manifest;
import android.annotation.SuppressLint;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

@CapacitorPlugin(
    name = "VoiceWorkbench",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class VoiceWorkbenchPlugin extends Plugin {
    private static final int ASR_SAMPLE_RATE = 16_000;
    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final String BUILT_IN_DASHSCOPE_API_KEY = "";
    private static final String BUILT_IN_DASHSCOPE_WORKSPACE_ID = "llm-0hn2qaqnqgcdfnbg";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final OkHttpClient httpClient = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .build();
    private final Object recognitionLock = new Object();
    private final List<ByteString> queuedAudio = new ArrayList<>();
    private final List<String> finalSegments = new ArrayList<>();
    private final Set<String> finalSegmentKeys = new HashSet<>();

    private PluginCall activeCall;
    private PluginCall wakeCall;
    private WebSocket asrSocket;
    private AudioRecord audioRecord;
    private Thread audioThread;
    private ScheduledFuture<?> timeoutFuture;
    private ScheduledFuture<?> silenceFuture;
    private MediaPlayer audioPlayer;
    private File audioPlayerFile;
    private PluginCall speechCall;
    private String taskId = "";
    private String clientSessionId = "";
    private String lastTranscript = "";
    private String interimText = "";
    private long lastTranscriptChangedAt = 0;
    private long activeSilenceMillis = 3000;
    private boolean taskStarted = false;
    private boolean finishSent = false;
    private boolean recognitionActive = false;
    private boolean wakeMode = false;
    private List<String> wakePhrases = new ArrayList<>();

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "startPermissionCallback");
            return;
        }

        VoiceConfig config;
        try {
            config = VoiceConfig.from(call);
        } catch (Exception error) {
            call.reject(safeVoiceError(error), "ALIYUN_VOICE_CONFIG_INVALID", error);
            return;
        }

        double timeoutSeconds = clampDouble(call.getDouble("timeoutSeconds", 30.0), 3, 120);
        double silenceSeconds = clampDouble(call.getDouble("silenceSeconds", 3.0), 0.8, 10);
        mainHandler.post(() -> beginRecognition(call, false, config, timeoutSeconds, silenceSeconds));
    }

    @PermissionCallback
    private void startPermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            start(call);
        } else {
            call.reject("没有麦克风权限。", "VOICE_PERMISSION_DENIED");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        mainHandler.post(() -> {
            finishRecognition(null, true);
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void startWakeWord(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "wakePermissionCallback");
            return;
        }

        VoiceConfig config;
        try {
            config = VoiceConfig.from(call);
        } catch (Exception error) {
            call.reject(safeVoiceError(error), "ALIYUN_VOICE_CONFIG_INVALID", error);
            return;
        }

        JSArray phraseArray = call.getArray("phrases");
        List<String> phrases = new ArrayList<>();
        if (phraseArray != null) {
            for (int index = 0; index < phraseArray.length(); index += 1) {
                phrases.add(phraseArray.optString(index, ""));
            }
        }
        if (phrases.isEmpty()) {
            phrases.add("你好工作台");
            phrases.add("AI Workbench");
            phrases.add("hey jarvis");
        }
        List<String> cleanPhrases = new ArrayList<>();
        for (String phrase : phrases) {
            String clean = stringValue(phrase).trim();
            if (!clean.isEmpty()) cleanPhrases.add(clean);
        }
        if (cleanPhrases.isEmpty()) cleanPhrases.add("未来");

        int timeoutSeconds = clamp(intValue(call.getInt("timeoutSeconds"), 50), 10, 120);
        List<String> finalPhrases = cleanPhrases;
        mainHandler.post(() -> {
            wakePhrases = finalPhrases;
            beginRecognition(call, true, config, timeoutSeconds, 3);
        });
    }

    @PermissionCallback
    private void wakePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            startWakeWord(call);
        } else {
            call.reject("没有麦克风权限。", "VOICE_PERMISSION_DENIED");
        }
    }

    @PluginMethod
    public void stopWakeWord(PluginCall call) {
        mainHandler.post(() -> {
            finishWakeWord(false, "", lastTranscript, null, true);
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = stringValue(call.getString("text")).trim();
        if (text.isEmpty()) {
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
            return;
        }

        VoiceConfig config;
        try {
            config = VoiceConfig.from(call);
        } catch (Exception error) {
            call.reject(safeVoiceError(error), "ALIYUN_TTS_CONFIG_INVALID", error);
            return;
        }

        String voiceName = firstNonEmpty(call.getString("voiceName"), call.getString("voiceType"), "longanhuan");
        String model = firstNonEmpty(call.getString("model"), "cosyvoice-v3-flash");
        executor.execute(() -> requestAliyunTts(text.substring(0, Math.min(3000, text.length())), voiceName, model, config, call));
    }

    @PluginMethod
    public void stopSpeech(PluginCall call) {
        mainHandler.post(() -> {
            stopSpeechPlayback();
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        });
    }

    private void beginRecognition(PluginCall call, boolean wake, VoiceConfig config, double timeoutSeconds, double silenceSeconds) {
        finishRecognition(null, false);
        finishWakeWord(false, "", "", null, false);
        resetRecognitionState();
        wakeMode = wake;
        recognitionActive = true;
        activeSilenceMillis = (long) (silenceSeconds * 1000);
        taskId = UUID.randomUUID().toString();
        clientSessionId = firstNonEmpty(call.getString("sessionId"), UUID.randomUUID().toString());
        if (wake) wakeCall = call;
        else activeCall = call;

        Request.Builder builder = new Request.Builder()
            .url("wss://dashscope.aliyuncs.com/api-ws/v1/inference")
            .header("Authorization", "Bearer " + config.apiKey)
            .header("User-Agent", "AI Workbench Android");
        if (!config.workspaceId.isEmpty()) {
            builder.header("X-DashScope-WorkSpace", config.workspaceId);
        }

        asrSocket = httpClient.newWebSocket(builder.build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                webSocket.send(asrRunTask(taskId).toString());
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                mainHandler.post(() -> handleAsrText(text));
            }

            @Override
            public void onMessage(WebSocket webSocket, ByteString bytes) {
                String text = bytes.string(StandardCharsets.UTF_8);
                mainHandler.post(() -> handleAsrText(text));
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable throwable, Response response) {
                mainHandler.post(() -> finishAliyunRecognition(new IOException(safeVoiceError(throwable))));
            }
        });

        try {
            startAudioCapture();
        } catch (Exception error) {
            finishAliyunRecognition(error);
            return;
        }

        timeoutFuture = scheduler.schedule(() -> mainHandler.post(() -> {
            if (wakeMode) finishWakeWord(false, "", lastTranscript, null, true);
            else finishRecognition(null, true);
        }), (long) (timeoutSeconds * 1000), TimeUnit.MILLISECONDS);

        if (!wake) {
            silenceFuture = scheduler.scheduleAtFixedRate(() -> mainHandler.post(this::finishRecognitionIfSilent), 250, 250, TimeUnit.MILLISECONDS);
        }
    }

    private JSONObject asrRunTask(String id) {
        JSONObject root = new JSONObject();
        JSONObject header = new JSONObject();
        JSONObject payload = new JSONObject();
        JSONObject parameters = new JSONObject();
        try {
            header.put("action", "run-task");
            header.put("task_id", id);
            header.put("streaming", "duplex");

            parameters.put("format", "pcm");
            parameters.put("sample_rate", ASR_SAMPLE_RATE);
            parameters.put("disfluency_removal_enabled", false);
            parameters.put("language_hints", new JSONArray().put("zh"));
            parameters.put("semantic_punctuation_enabled", false);
            parameters.put("max_sentence_silence", 3000);
            parameters.put("punctuation_prediction_enabled", true);
            parameters.put("inverse_text_normalization_enabled", true);

            payload.put("task_group", "audio");
            payload.put("task", "asr");
            payload.put("function", "recognition");
            payload.put("model", "paraformer-realtime-v2");
            payload.put("parameters", parameters);
            payload.put("input", new JSONObject());

            root.put("header", header);
            root.put("payload", payload);
        } catch (Exception ignored) {
            // JSONObject put only fails for invalid numbers, which are not used here.
        }
        return root;
    }

    private JSONObject asrFinishTask(String id) {
        JSONObject root = new JSONObject();
        JSONObject header = new JSONObject();
        JSONObject payload = new JSONObject();
        try {
            header.put("action", "finish-task");
            header.put("task_id", id);
            header.put("streaming", "duplex");
            payload.put("input", new JSONObject());
            root.put("header", header);
            root.put("payload", payload);
        } catch (Exception ignored) {
            // JSONObject put only fails for invalid numbers, which are not used here.
        }
        return root;
    }

    private void handleAsrText(String text) {
        try {
            JSONObject root = new JSONObject(text);
            JSONObject header = root.optJSONObject("header");
            if (header == null) return;
            String event = header.optString("event", "");

            if ("task-started".equals(event)) {
                taskStarted = true;
                flushQueuedAudio();
                return;
            }

            if ("result-generated".equals(event)) {
                JSONObject payload = root.optJSONObject("payload");
                JSONObject output = payload == null ? null : payload.optJSONObject("output");
                JSONObject sentence = output == null ? null : output.optJSONObject("sentence");
                if (sentence == null || sentence.optBoolean("heartbeat", false)) return;

                String nextText = sentenceText(sentence);
                if (nextText.isEmpty()) return;

                boolean sentenceEnd = sentence.optBoolean("sentence_end", false);
                if (sentenceEnd) {
                    interimText = "";
                    String key = sentence.optString("begin_time", "") + ":" + sentence.optString("end_time", "") + ":" + nextText;
                    if (!finalSegmentKeys.contains(key)) {
                        finalSegmentKeys.add(key);
                        finalSegments.add(nextText);
                    }
                } else {
                    interimText = nextText;
                }

                String joined = joinTranscript();
                if (joined.isEmpty()) return;
                lastTranscript = joined;
                lastTranscriptChangedAt = System.currentTimeMillis();

                JSObject eventPayload = new JSObject();
                eventPayload.put("text", joined);
                eventPayload.put("isFinal", sentenceEnd);
                eventPayload.put("provider", "pisen-dashscope-asr");
                eventPayload.put("mode", wakeMode ? "wake" : "dictation");
                eventPayload.put("sessionId", clientSessionId);
                if (!wakeMode) {
                    notifyListeners("voiceTranscript", eventPayload);
                }

                if (wakeMode) {
                    String phrase = detectWakePhrase(joined);
                    if (!phrase.isEmpty()) {
                        finishWakeWord(true, phrase, joined, null, true);
                    }
                }
                return;
            }

            if ("task-finished".equals(event)) {
                if (wakeMode) finishWakeWord(false, "", lastTranscript, null, false);
                else finishRecognition(null, false);
                return;
            }

            if ("task-failed".equals(event)) {
                String message = firstNonEmpty(header.optString("error_message", ""), header.optString("error_code", ""), "阿里云 ASR 任务失败。");
                finishAliyunRecognition(new IOException(message));
            }
        } catch (Exception ignored) {
            // Non-json frames are ignored.
        }
    }

    private String sentenceText(JSONObject sentence) {
        String text = sentence.optString("text", "").trim();
        if (!text.isEmpty()) return text;
        JSONArray words = sentence.optJSONArray("words");
        if (words == null) return "";
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < words.length(); index += 1) {
            JSONObject word = words.optJSONObject(index);
            if (word == null) continue;
            builder.append(word.optString("text", ""));
            builder.append(word.optString("punctuation", ""));
        }
        return builder.toString().trim();
    }

    private String joinTranscript() {
        StringBuilder builder = new StringBuilder();
        for (String segment : finalSegments) {
            String clean = segment.trim();
            if (clean.isEmpty()) continue;
            if (builder.length() > 0) builder.append('\n');
            builder.append(clean);
        }
        String interim = interimText.trim();
        if (!interim.isEmpty()) {
            if (builder.length() > 0) builder.append('\n');
            builder.append(interim);
        }
        return builder.toString().trim();
    }

    private void finishAliyunRecognition(Throwable error) {
        if (wakeMode) finishWakeWord(false, "", lastTranscript, error, true);
        else finishRecognition(error, true);
    }

    private void finishRecognitionIfSilent() {
        if (activeCall == null || lastTranscript.isEmpty() || lastTranscriptChangedAt <= 0) return;
        if (System.currentTimeMillis() - lastTranscriptChangedAt >= activeSilenceMillis) {
            finishRecognition(null, true);
        }
    }

    private void finishRecognition(Throwable error, boolean sendFinish) {
        PluginCall call = activeCall;
        activeCall = null;
        String text = lastTranscript.trim();
        stopRecognition(sendFinish && error == null);

        if (call == null) return;
        resetTranscriptOnly();

        if (error != null && text.isEmpty() && !isQuietSpeechError(error)) {
            call.reject("语音识别失败：" + safeVoiceError(error), "VOICE_RECOGNITION_FAILED", error instanceof Exception ? (Exception) error : null);
            return;
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("text", text);
        call.resolve(result);
    }

    private void finishWakeWord(boolean detected, String phrase, String text, Throwable error, boolean sendFinish) {
        PluginCall call = wakeCall;
        wakeCall = null;
        stopRecognition(sendFinish && error == null);

        if (call == null) return;
        resetTranscriptOnly();

        if (error != null && !detected && !isQuietSpeechError(error)) {
            call.reject("唤醒词监听失败：" + safeVoiceError(error), "WAKE_WORD_FAILED", error instanceof Exception ? (Exception) error : null);
            return;
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("detected", detected);
        result.put("phrase", phrase);
        result.put("text", stringValue(text).trim());
        call.resolve(result);
    }

    private void stopRecognition(boolean sendFinish) {
        cancelTimers();
        recognitionActive = false;
        stopAudioCapture();

        synchronized (recognitionLock) {
            if (sendFinish && asrSocket != null && taskStarted && !finishSent) {
                finishSent = true;
                asrSocket.send(asrFinishTask(taskId).toString());
            }
            if (asrSocket != null) {
                asrSocket.close(1000, "done");
                asrSocket = null;
            }
            queuedAudio.clear();
            taskStarted = false;
            finishSent = false;
        }
    }

    @SuppressLint("MissingPermission")
    private void startAudioCapture() throws IOException {
        int minBuffer = AudioRecord.getMinBufferSize(
            ASR_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        if (minBuffer <= 0) throw new IOException("当前设备暂时不能使用麦克风。");
        int bufferSize = Math.max(minBuffer * 2, 4096);
        audioRecord = new AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            ASR_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        );
        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            throw new IOException("当前设备暂时不能使用麦克风。");
        }
        audioRecord.startRecording();
        audioThread = new Thread(() -> {
            byte[] buffer = new byte[4096];
            while (recognitionActive && audioRecord != null) {
                int read = audioRecord.read(buffer, 0, buffer.length);
                if (read > 0) sendAliyunAudio(ByteString.of(buffer, 0, read));
            }
        }, "AIWorkbench-ASR");
        audioThread.start();
    }

    private void stopAudioCapture() {
        AudioRecord recorder = audioRecord;
        audioRecord = null;
        if (recorder != null) {
            try {
                recorder.stop();
            } catch (Exception ignored) {
                // Recorder may already be stopped.
            }
            recorder.release();
        }
        Thread thread = audioThread;
        audioThread = null;
        if (thread != null) thread.interrupt();
    }

    private void sendAliyunAudio(ByteString data) {
        if (data == null || data.size() == 0) return;
        synchronized (recognitionLock) {
            if (asrSocket == null) return;
            if (taskStarted) {
                asrSocket.send(data);
            } else {
                queuedAudio.add(data);
                if (queuedAudio.size() > 80) queuedAudio.remove(0);
            }
        }
    }

    private void flushQueuedAudio() {
        synchronized (recognitionLock) {
            if (asrSocket == null || !taskStarted) return;
            for (ByteString item : queuedAudio) asrSocket.send(item);
            queuedAudio.clear();
        }
    }

    private void requestAliyunTts(String text, String voiceName, String model, VoiceConfig config, PluginCall call) {
        try {
            JSONObject body = new JSONObject();
            JSONObject input = new JSONObject();
            input.put("text", text);
            input.put("voice", firstNonEmpty(voiceName, "longanhuan"));
            input.put("format", "wav");
            input.put("sample_rate", 24_000);
            body.put("model", firstNonEmpty(model, "cosyvoice-v3-flash"));
            body.put("input", input);

            Request.Builder builder = new Request.Builder()
                .url("https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer")
                .post(RequestBody.create(body.toString(), JSON))
                .header("Authorization", "Bearer " + config.apiKey)
                .header("Content-Type", "application/json");
            if (!config.workspaceId.isEmpty()) {
                builder.header("X-DashScope-WorkSpace", config.workspaceId);
            }

            httpClient.newCall(builder.build()).enqueue(new Callback() {
                @Override
                public void onFailure(Call requestCall, IOException error) {
                    call.reject("阿里云 TTS 失败：" + safeVoiceError(error), "ALIYUN_TTS_FAILED", error);
                }

                @Override
                public void onResponse(Call requestCall, Response response) {
                    try (Response closeable = response) {
                        byte[] data = closeable.body() == null ? new byte[0] : closeable.body().bytes();
                        if (!closeable.isSuccessful()) {
                            throw new IOException("阿里云 TTS 请求失败 (" + closeable.code() + ")：" + new String(data, StandardCharsets.UTF_8));
                        }
                        String contentType = closeable.header("Content-Type", "");
                        if (!contentType.toLowerCase(Locale.ROOT).contains("audio/")) {
                            data = parseTtsJsonAudio(data);
                        }
                        byte[] audio = data;
                        mainHandler.post(() -> playAliyunAudio(audio, call));
                    } catch (Exception error) {
                        call.reject("阿里云 TTS 失败：" + safeVoiceError(error), "ALIYUN_TTS_FAILED", error instanceof Exception ? (Exception) error : null);
                    }
                }
            });
        } catch (Exception error) {
            call.reject("阿里云 TTS 失败：" + safeVoiceError(error), "ALIYUN_TTS_FAILED", error);
        }
    }

    private byte[] parseTtsJsonAudio(byte[] data) throws Exception {
        JSONObject root = new JSONObject(new String(data, StandardCharsets.UTF_8));
        JSONObject output = root.optJSONObject("output");
        JSONObject audio = output == null ? null : output.optJSONObject("audio");
        if (audio == null) throw new IOException("阿里云 TTS 没有返回可播放音频。");

        String base64Data = audio.optString("data", "");
        if (!base64Data.isEmpty()) {
            String raw = base64Data.contains(",") ? base64Data.substring(base64Data.lastIndexOf(",") + 1) : base64Data;
            return android.util.Base64.decode(raw, android.util.Base64.DEFAULT);
        }

        String url = audio.optString("url", "");
        if (!url.isEmpty()) {
            Response response = httpClient.newCall(new Request.Builder().url(url).build()).execute();
            try (Response closeable = response) {
                if (!closeable.isSuccessful()) throw new IOException("阿里云 TTS 音频下载失败。");
                return closeable.body() == null ? new byte[0] : closeable.body().bytes();
            }
        }

        throw new IOException("阿里云 TTS 没有返回可播放音频。");
    }

    private void playAliyunAudio(byte[] data, PluginCall call) {
        try {
            stopSpeechPlayback();
            File file = new File(getContext().getCacheDir(), "ai-workbench-tts-" + System.currentTimeMillis() + ".wav");
            try (FileOutputStream stream = new FileOutputStream(file)) {
                stream.write(data);
            }

            MediaPlayer player = new MediaPlayer();
            audioPlayer = player;
            audioPlayerFile = file;
            speechCall = call;
            player.setDataSource(file.getAbsolutePath());
            player.setOnCompletionListener((completed) -> mainHandler.post(() -> finishSpeechPlayback(null, false)));
            player.setOnErrorListener((failed, what, extra) -> {
                mainHandler.post(() -> finishSpeechPlayback(new IOException("阿里云 TTS 播放失败。"), false));
                return true;
            });
            player.prepare();
            player.start();
            JSObject state = new JSObject();
            state.put("state", "speaking");
            notifyListeners("speechState", state);
        } catch (Exception error) {
            if (speechCall == call) {
                finishSpeechPlayback(error, false);
            } else {
                call.reject("阿里云 TTS 播放失败：" + safeVoiceError(error), "ALIYUN_TTS_PLAY_FAILED", error);
            }
        }
    }

    private void stopSpeechPlayback() {
        finishSpeechPlayback(null, true);
    }

    private void finishSpeechPlayback(Exception error, boolean interrupted) {
        MediaPlayer player = audioPlayer;
        audioPlayer = null;
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
                // Player may already be stopped.
            }
            player.release();
        }
        if (audioPlayerFile != null) {
            //noinspection ResultOfMethodCallIgnored
            audioPlayerFile.delete();
            audioPlayerFile = null;
        }
        PluginCall call = speechCall;
        speechCall = null;
        JSObject state = new JSObject();
        state.put("state", "idle");
        notifyListeners("speechState", state);
        if (call != null) {
            if (error != null) {
                call.reject("阿里云 TTS 播放失败：" + safeVoiceError(error), "ALIYUN_TTS_PLAY_FAILED", error);
            } else {
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("provider", "pisen-aliyun-tts");
                if (interrupted) result.put("interrupted", true);
                call.resolve(result);
            }
        }
    }

    private String detectWakePhrase(String text) {
        String normalized = normalizeWakeText(text);
        for (String phrase : wakePhrases) {
            String target = normalizeWakeText(phrase);
            if (!target.isEmpty() && normalized.contains(target)) return phrase;
        }
        return "";
    }

    private String normalizeWakeText(String text) {
        String normalized = Normalizer.normalize(stringValue(text), Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        return normalized.replaceAll("[\\s，。,.!?！？、\\p{Punct}]+", "");
    }

    private boolean isQuietSpeechError(Throwable error) {
        String message = safeVoiceError(error).toLowerCase(Locale.ROOT);
        return message.contains("no speech")
            || message.contains("no input")
            || message.contains("cancel")
            || message.contains("aborted")
            || message.contains("cancelled");
    }

    private void cancelTimers() {
        if (timeoutFuture != null) timeoutFuture.cancel(true);
        timeoutFuture = null;
        if (silenceFuture != null) silenceFuture.cancel(true);
        silenceFuture = null;
    }

    private void resetRecognitionState() {
        taskStarted = false;
        finishSent = false;
        taskId = "";
        clientSessionId = "";
        resetTranscriptOnly();
        synchronized (recognitionLock) {
            queuedAudio.clear();
        }
    }

    private void resetTranscriptOnly() {
        lastTranscript = "";
        interimText = "";
        lastTranscriptChangedAt = 0;
        finalSegments.clear();
        finalSegmentKeys.clear();
    }

    private static class VoiceConfig {
        final String apiKey;
        final String workspaceId;

        private VoiceConfig(String apiKey, String workspaceId) {
            this.apiKey = apiKey;
            this.workspaceId = workspaceId;
        }

        static VoiceConfig from(PluginCall call) {
            String apiKey = firstNonEmpty(call.getString("apiKey"), call.getString("aliyunApiKey"), BUILT_IN_DASHSCOPE_API_KEY).trim();
            String workspaceId = firstNonEmpty(call.getString("workspaceId"), call.getString("aliyunWorkspaceId"), BUILT_IN_DASHSCOPE_WORKSPACE_ID).trim();
            if (apiKey.isEmpty()) {
                throw new IllegalArgumentException("缺少阿里云 DashScope API Key。");
            }
            return new VoiceConfig(apiKey, workspaceId);
        }
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            String text = stringValue(value).trim();
            if (!text.isEmpty()) return text;
        }
        return "";
    }

    private static int intValue(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double clampDouble(Double value, double min, double max) {
        double number = value == null ? min : value;
        return Math.max(min, Math.min(max, number));
    }

    private static String stringValue(String value) {
        return value == null ? "" : value;
    }

    private static String safeVoiceError(Throwable error) {
        if (error == null) return "";
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) message = error.toString();
        return message.replace("\n", " ");
    }
}
