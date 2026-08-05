import Foundation
import Security
import CryptoKit
import AVFoundation
import Capacitor
import Citadel
import NIOCore
@preconcurrency import NIOSSH
import UIKit
import WebKit

private struct SSHConnectionConfig {
    let sessionId: String
    let host: String
    let port: Int
    let username: String
    let password: String
    let connectTimeoutSeconds: Int64
    let commandTimeoutSeconds: Int64
    let stdin: String
    let uploadScript: Bool
    let sshHostKeyFingerprint: String

    var connectionFingerprint: String {
        [host, String(port), username, password, sshHostKeyFingerprint].joined(separator: "\u{0}")
    }

    init(call: CAPPluginCall) throws {
        guard let host = call.getString("host")?.trimmingCharacters(in: .whitespacesAndNewlines), !host.isEmpty else {
            throw SSHWorkbenchError.missingField("host")
        }
        guard let username = call.getString("username")?.trimmingCharacters(in: .whitespacesAndNewlines), !username.isEmpty else {
            throw SSHWorkbenchError.missingField("username")
        }
        guard let password = call.getString("password"), !password.isEmpty else {
            throw SSHWorkbenchError.missingField("password")
        }

        self.sessionId = (call.getString("sessionId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        self.host = host
        self.username = username
        self.password = password
        self.port = max(1, call.getInt("port", 22))
        self.connectTimeoutSeconds = Int64(max(3, min(call.getInt("connectTimeoutSeconds", 15), 60)))
        self.commandTimeoutSeconds = Int64(max(5, min(call.getInt("commandTimeoutSeconds", 180), 7200)))
        self.stdin = call.getString("stdin") ?? ""
        self.uploadScript = call.getBool("uploadScript", false)
        self.sshHostKeyFingerprint = (call.getString("sshHostKeyFingerprint") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private enum SSHHostKeyTrustError: LocalizedError {
    case untrusted(String)
    case changed(String)

    var errorDescription: String? {
        switch self {
        case .untrusted(let fingerprint):
            return "SSH_HOST_KEY_UNTRUSTED:\(fingerprint)"
        case .changed(let fingerprint):
            return "SSH_HOST_KEY_CHANGED:\(fingerprint)"
        }
    }
}

private final class PinnedSSHHostKeyValidator: NIOSSHClientServerAuthenticationDelegate, @unchecked Sendable {
    private let expectedFingerprint: String

    init(expectedFingerprint: String) {
        self.expectedFingerprint = expectedFingerprint
    }

    func validateHostKey(hostKey: NIOSSHPublicKey, validationCompletePromise: EventLoopPromise<Void>) {
        let openSSHKey = String(openSSHPublicKey: hostKey)
        let encodedKey = openSSHKey.split(separator: " ", maxSplits: 2).dropFirst().first.map(String.init) ?? ""
        let rawKey = Data(base64Encoded: encodedKey) ?? Data(openSSHKey.utf8)
        let digest = Data(SHA256.hash(data: rawKey)).base64EncodedString()
        let presentedFingerprint = "sha256/\(digest)"

        guard !expectedFingerprint.isEmpty else {
            validationCompletePromise.fail(SSHHostKeyTrustError.untrusted(presentedFingerprint))
            return
        }
        guard expectedFingerprint == presentedFingerprint else {
            validationCompletePromise.fail(SSHHostKeyTrustError.changed(presentedFingerprint))
            return
        }
        validationCompletePromise.succeed(())
    }
}

private actor NativeCommandSessionStore {
    private struct PooledConnection {
        let client: SSHClient
        var sessionIds: Set<String>
        var idleCloseTask: Task<Void, Never>?
    }

    private var connections: [String: PooledConnection] = [:]
    private var sessionFingerprints: [String: String] = [:]

    func client(for sessionId: String, fingerprint: String) async -> SSHClient? {
        var staleClient: SSHClient?
        if let previousFingerprint = sessionFingerprints[sessionId], previousFingerprint != fingerprint {
            staleClient = detachMapping(sessionId, closeWhenUnused: true)
        }
        guard var connection = connections[fingerprint] else {
            if let staleClient {
                try? await staleClient.close()
            }
            return nil
        }
        connection.idleCloseTask?.cancel()
        connection.idleCloseTask = nil
        connection.sessionIds.insert(sessionId)
        connections[fingerprint] = connection
        sessionFingerprints[sessionId] = fingerprint
        if let staleClient {
            try? await staleClient.close()
        }
        return connection.client
    }

    func store(_ client: SSHClient, fingerprint: String, sessionId: String) async -> SSHClient {
        if let existing = await self.client(for: sessionId, fingerprint: fingerprint) {
            try? await client.close()
            return existing
        }
        connections[fingerprint] = PooledConnection(
            client: client,
            sessionIds: [sessionId],
            idleCloseTask: nil
        )
        sessionFingerprints[sessionId] = fingerprint
        return client
    }

    func detach(_ sessionId: String, preserveTransport: Bool) async -> Bool {
        guard let fingerprint = sessionFingerprints[sessionId] else {
            return false
        }
        let clientToClose = detachMapping(sessionId, closeWhenUnused: !preserveTransport)
        if let clientToClose {
            try? await clientToClose.close()
            return true
        }
        if preserveTransport, var connection = connections[fingerprint], connection.sessionIds.isEmpty {
            connection.idleCloseTask?.cancel()
            connection.idleCloseTask = Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard !Task.isCancelled else { return }
                await self.closeIfIdle(fingerprint)
            }
            connections[fingerprint] = connection
        }
        return true
    }

    func invalidate(_ sessionId: String) async -> [String] {
        guard
            let fingerprint = sessionFingerprints[sessionId],
            let connection = connections.removeValue(forKey: fingerprint)
        else {
            sessionFingerprints.removeValue(forKey: sessionId)
            return [sessionId]
        }
        connection.idleCloseTask?.cancel()
        for attachedSessionId in connection.sessionIds {
            sessionFingerprints.removeValue(forKey: attachedSessionId)
        }
        try? await connection.client.close()
        return Array(connection.sessionIds)
    }

    func closeAll() async {
        let pooledConnections = Array(connections.values)
        connections.removeAll()
        sessionFingerprints.removeAll()
        for connection in pooledConnections {
            connection.idleCloseTask?.cancel()
            try? await connection.client.close()
        }
    }

    private func detachMapping(_ sessionId: String, closeWhenUnused: Bool) -> SSHClient? {
        guard
            let fingerprint = sessionFingerprints.removeValue(forKey: sessionId),
            var connection = connections[fingerprint]
        else {
            return nil
        }
        connection.sessionIds.remove(sessionId)
        if connection.sessionIds.isEmpty, closeWhenUnused {
            connection.idleCloseTask?.cancel()
            connections.removeValue(forKey: fingerprint)
            return connection.client
        }
        connections[fingerprint] = connection
        return nil
    }

    private func closeIfIdle(_ fingerprint: String) async {
        guard
            let connection = connections[fingerprint],
            connection.sessionIds.isEmpty
        else {
            return
        }
        connections.removeValue(forKey: fingerprint)
        try? await connection.client.close()
    }
}

private enum NativeTerminalError: LocalizedError {
    case missingSession
    case sessionNotReady

    var errorDescription: String? {
        switch self {
        case .missingSession:
            return "SSH 终端会话不存在或已经关闭。"
        case .sessionNotReady:
            return "SSH 终端仍在连接，请稍后再试。"
        }
    }
}

private actor NativeTerminalSessionStore {
    private struct Session {
        var client: SSHClient?
        var writer: TTYStdinWriter?
    }

    private var sessions: [String: Session] = [:]

    func prepare(_ terminalId: String) {
        sessions[terminalId] = Session()
    }

    func attach(client: SSHClient, terminalId: String) -> Bool {
        guard var session = sessions[terminalId] else {
            return false
        }
        session.client = client
        sessions[terminalId] = session
        return true
    }

    func attach(writer: TTYStdinWriter, terminalId: String) -> Bool {
        guard var session = sessions[terminalId] else {
            return false
        }
        session.writer = writer
        sessions[terminalId] = session
        return true
    }

    func write(_ data: Data, terminalId: String) async throws {
        guard let session = sessions[terminalId] else {
            throw NativeTerminalError.missingSession
        }
        guard let writer = session.writer else {
            throw NativeTerminalError.sessionNotReady
        }
        var buffer = ByteBufferAllocator().buffer(capacity: data.count)
        buffer.writeBytes(data)
        try await writer.write(buffer)
    }

    func resize(terminalId: String, cols: Int, rows: Int) async throws {
        guard let session = sessions[terminalId] else {
            throw NativeTerminalError.missingSession
        }
        guard let writer = session.writer else {
            throw NativeTerminalError.sessionNotReady
        }
        try await writer.changeSize(
            cols: max(20, cols),
            rows: max(6, rows),
            pixelWidth: 0,
            pixelHeight: 0
        )
    }

    func close(_ terminalId: String) async {
        guard let session = sessions.removeValue(forKey: terminalId) else {
            return
        }
        try? await session.client?.close()
    }

    func finish(_ terminalId: String) -> Bool {
        sessions.removeValue(forKey: terminalId) != nil
    }
}

private enum VoiceWorkbenchError: LocalizedError {
    case microphoneUnavailable
    case missingAliyunApiKey

    var errorDescription: String? {
        switch self {
        case .microphoneUnavailable:
            return "当前设备暂时不能使用麦克风。"
        case .missingAliyunApiKey:
            return "缺少阿里云 DashScope API Key。请先在语音设置里填写。"
        }
    }
}

private enum VoiceRecognitionMode {
    case dictation
    case wake
}

private struct DashScopeVoiceConfig {
    private static let builtInApiKey = ""
    private static let builtInWorkspaceId = "llm-0hn2qaqnqgcdfnbg"

    let apiKey: String
    let workspaceId: String

    init(call: CAPPluginCall) throws {
        let payloadKey = call.getString("apiKey") ?? call.getString("aliyunApiKey") ?? ""
        let plistKey = Bundle.main.object(forInfoDictionaryKey: "DashScopeAPIKey") as? String ?? ""
        let resolvedKey = [payloadKey, plistKey, Self.builtInApiKey]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""

        guard !resolvedKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw VoiceWorkbenchError.missingAliyunApiKey
        }

        let payloadWorkspaceId = call.getString("workspaceId") ?? call.getString("aliyunWorkspaceId") ?? ""
        let plistWorkspaceId = Bundle.main.object(forInfoDictionaryKey: "DashScopeWorkspaceID") as? String ?? ""

        self.apiKey = resolvedKey.trimmingCharacters(in: .whitespacesAndNewlines)
        self.workspaceId = [payloadWorkspaceId, plistWorkspaceId, Self.builtInWorkspaceId]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
    }
}

@objc(VoiceWorkbenchPlugin)
public class VoiceWorkbenchPlugin: CAPPlugin, CAPBridgedPlugin, AVAudioPlayerDelegate {
    public let identifier = "VoiceWorkbenchPlugin"
    public let jsName = "VoiceWorkbench"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeech", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startWakeWord", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopWakeWord", returnType: CAPPluginReturnPromise)
    ]

    private var audioEngine: AVAudioEngine?
    private var activeCall: CAPPluginCall?
    private var timeoutTimer: Timer?
    private var silenceTimer: Timer?
    private var recognitionFinishTimer: Timer?
    private var lastTranscript = ""
    private var lastTranscriptChangedAt: Date?
    private var activeSilenceSeconds: TimeInterval = 3
    private var wakeAudioEngine: AVAudioEngine?
    private var wakeCall: CAPPluginCall?
    private var wakeTimeoutTimer: Timer?
    private var wakePhrases: [String] = []
    private var wakeTranscript = ""
    private var aliyunMode: VoiceRecognitionMode = .dictation
    private var aliyunConfig: DashScopeVoiceConfig?
    private var aliyunTask: URLSessionWebSocketTask?
    private var aliyunSession: URLSession?
    private var aliyunTaskId = ""
    private var aliyunTaskStarted = false
    private var aliyunFinishSent = false
    private var aliyunAudioQueue: [Data] = []
    private var aliyunFinalSegments: [String] = []
    private var aliyunFinalSegmentKeys = Set<String>()
    private var aliyunInterimText = ""
    private var aliyunAudioConverter: AVAudioConverter?
    private var aliyunTargetFormat: AVAudioFormat?
    private var audioPlayer: AVAudioPlayer?
    private var speechCall: CAPPluginCall?

    @objc func start(_ call: CAPPluginCall) {
        let timeoutSeconds = max(3, min(call.getDouble("timeoutSeconds", 30), 120))
        let silenceSeconds = max(0.8, min(call.getDouble("silenceSeconds", 3), 10))
        let config: DashScopeVoiceConfig

        do {
            config = try DashScopeVoiceConfig(call: call)
        } catch {
            call.reject(safeVoiceError(error), "ALIYUN_VOICE_CONFIG_INVALID", error)
            return
        }

        DispatchQueue.main.async {
            self.finishWakeWord(detected: false, phrase: "", text: "")
            self.finishRecognition(error: nil)
            self.lastTranscript = ""
            self.lastTranscriptChangedAt = nil
            self.activeCall = call

            self.requestMicrophonePermission { granted in
                let allowed = granted
                guard allowed else {
                    self.finishRecognition(error: nil, fallbackMessage: "没有麦克风权限。")
                    return
                }

                do {
                    try self.beginAliyunRecognition(
                        mode: .dictation,
                        config: config,
                        timeoutSeconds: timeoutSeconds,
                        silenceSeconds: silenceSeconds
                    )
                } catch {
                    self.finishRecognition(error: error)
                }
            }
        }
    }

    @objc func startWakeWord(_ call: CAPPluginCall) {
        let phrases = call.getArray("phrases", String.self) ?? ["你好工作台", "AI Workbench", "hey jarvis"]
        let timeoutSeconds = max(10, min(call.getInt("timeoutSeconds", 50), 120))
        let config: DashScopeVoiceConfig

        do {
            config = try DashScopeVoiceConfig(call: call)
        } catch {
            call.reject(safeVoiceError(error), "ALIYUN_VOICE_CONFIG_INVALID", error)
            return
        }

        DispatchQueue.main.async {
            self.finishRecognition(error: nil)
            self.finishWakeWord(detected: false, phrase: "", text: "")
            self.wakeCall = call
            self.wakeTranscript = ""
            self.wakePhrases = phrases
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }

            if self.wakePhrases.isEmpty {
                self.wakePhrases = ["你好工作台", "AI Workbench", "hey jarvis"]
            }

            self.requestMicrophonePermission { granted in
                let allowed = granted
                guard allowed else {
                    self.finishWakeWord(
                        detected: false,
                        phrase: "",
                        text: "",
                        error: nil,
                        fallbackMessage: "没有麦克风权限。"
                    )
                    return
                }

                do {
                    try self.beginAliyunRecognition(
                        mode: .wake,
                        config: config,
                        timeoutSeconds: TimeInterval(timeoutSeconds),
                        silenceSeconds: 3
                    )
                } catch {
                    self.finishWakeWord(detected: false, phrase: "", text: "", error: error)
                }
            }
        }
    }

    @objc func stopWakeWord(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishWakeWord(detected: false, phrase: "", text: "")
            call.resolve(["ok": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishRecognition(error: nil)
            call.resolve(["ok": true])
        }
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let voiceName = call.getString("voiceName") ?? call.getString("voiceType") ?? "longanhuan"
        let model = call.getString("model") ?? "cosyvoice-v3-flash"
        let config: DashScopeVoiceConfig

        do {
            config = try DashScopeVoiceConfig(call: call)
        } catch {
            call.reject(safeVoiceError(error), "ALIYUN_TTS_CONFIG_INVALID", error)
            return
        }

        guard !text.isEmpty else {
            call.resolve(["ok": true])
            return
        }

        Task {
            do {
                let audioData = try await self.requestAliyunTts(
                    text: String(text.prefix(3000)),
                    voiceName: voiceName,
                    model: model,
                    config: config
                )

                DispatchQueue.main.async {
                    do {
                        try self.playAliyunAudio(audioData, call: call)
                    } catch {
                        call.reject("阿里云 TTS 播放失败：\(self.safeVoiceError(error))", "ALIYUN_TTS_PLAY_FAILED", error)
                    }
                }
            } catch {
                call.reject("阿里云 TTS 失败：\(self.safeVoiceError(error))", "ALIYUN_TTS_FAILED", error)
            }
        }
    }

    @objc func stopSpeech(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopSpeechPlayback()
            call.resolve(["ok": true])
        }
    }

    private func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: completion)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(completion)
        }
    }

    private func beginAliyunRecognition(
        mode: VoiceRecognitionMode,
        config: DashScopeVoiceConfig,
        timeoutSeconds: TimeInterval,
        silenceSeconds: TimeInterval
    ) throws {
        aliyunMode = mode
        aliyunConfig = config
        aliyunTaskId = UUID().uuidString
        aliyunTaskStarted = false
        aliyunFinishSent = false
        aliyunAudioQueue = []
        aliyunFinalSegments = []
        aliyunFinalSegmentKeys = []
        aliyunInterimText = ""
        lastTranscript = ""
        lastTranscriptChangedAt = nil
        activeSilenceSeconds = silenceSeconds

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .mixWithOthers, .defaultToSpeaker, .allowBluetooth])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        var request = URLRequest(url: URL(string: "wss://dashscope.aliyuncs.com/api-ws/v1/inference")!)
        request.timeoutInterval = timeoutSeconds + 12
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("AI Workbench", forHTTPHeaderField: "User-Agent")
        if !config.workspaceId.isEmpty {
            request.setValue(config.workspaceId, forHTTPHeaderField: "X-DashScope-WorkSpace")
        }

        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: request)
        aliyunSession = session
        aliyunTask = task
        task.resume()
        listenForAliyunAsrEvents()
        sendAliyunJson(dashScopeAsrRunTask(taskId: aliyunTaskId, sampleRate: 16_000))

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0 else {
            throw VoiceWorkbenchError.microphoneUnavailable
        }
        guard let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true) else {
            throw VoiceWorkbenchError.microphoneUnavailable
        }
        guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
            throw VoiceWorkbenchError.microphoneUnavailable
        }

        aliyunTargetFormat = targetFormat
        aliyunAudioConverter = converter

        inputNode.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak self] buffer, _ in
            guard let self, let data = self.pcm16Data(from: buffer) else {
                return
            }
            DispatchQueue.main.async {
                self.enqueueAliyunAudio(data)
            }
        }

        if mode == .dictation {
            audioEngine = engine
        } else {
            wakeAudioEngine = engine
        }

        engine.prepare()
        try engine.start()

        let recognitionTimeoutTimer = Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if mode == .wake {
                    self.finishWakeWord(detected: false, phrase: "", text: self.wakeTranscript)
                } else if self.lastTranscript.isEmpty {
                    self.finishRecognition(error: nil)
                } else {
                    self.requestRecognitionFinish()
                }
            }
        }
        if mode == .wake {
            wakeTimeoutTimer = recognitionTimeoutTimer
        } else {
            timeoutTimer = recognitionTimeoutTimer
        }

        if mode == .dictation {
            silenceTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
                DispatchQueue.main.async {
                    self?.finishRecognitionIfSilent()
                }
            }
        }
    }

    private func dashScopeAsrRunTask(taskId: String, sampleRate: Int) -> [String: Any] {
        [
            "header": [
                "action": "run-task",
                "task_id": taskId,
                "streaming": "duplex"
            ],
            "payload": [
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "model": "paraformer-realtime-v2",
                "parameters": [
                    "format": "pcm",
                    "sample_rate": sampleRate,
                    "disfluency_removal_enabled": false,
                    "language_hints": ["zh"],
                    "semantic_punctuation_enabled": false,
                    // Keep server-side sentence finalization quick. The app's
                    // separate silence timer still controls the 3-second end
                    // of dictation window.
                    "max_sentence_silence": 1000,
                    "punctuation_prediction_enabled": true,
                    "inverse_text_normalization_enabled": true
                ],
                "input": [:]
            ]
        ]
    }

    private func dashScopeAsrFinishTask(taskId: String) -> [String: Any] {
        [
            "header": [
                "action": "finish-task",
                "task_id": taskId,
                "streaming": "duplex"
            ],
            "payload": [
                "input": [:]
            ]
        ]
    }

    private func sendAliyunJson(_ object: [String: Any]) {
        guard let task = aliyunTask else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: object, options: [])
            let text = String(data: data, encoding: .utf8) ?? "{}"
            task.send(.string(text)) { [weak self] error in
                guard let self, let error else { return }
                DispatchQueue.main.async {
                    self.finishAliyunRecognition(error: error)
                }
            }
        } catch {
            finishAliyunRecognition(error: error)
        }
    }

    private func enqueueAliyunAudio(_ data: Data) {
        guard !data.isEmpty else { return }
        if aliyunTaskStarted, let task = aliyunTask {
            task.send(.data(data)) { [weak self] error in
                guard let self, let error else { return }
                DispatchQueue.main.async {
                    self.finishAliyunRecognition(error: error)
                }
            }
        } else {
            aliyunAudioQueue.append(data)
        }
    }

    private func flushAliyunAudioQueue() {
        guard aliyunTaskStarted else { return }
        let queued = aliyunAudioQueue
        aliyunAudioQueue = []
        queued.forEach { enqueueAliyunAudio($0) }
    }

    private func sendAliyunFinishTask() {
        guard aliyunTaskStarted, !aliyunFinishSent else { return }
        aliyunFinishSent = true
        sendAliyunJson(dashScopeAsrFinishTask(taskId: aliyunTaskId))
    }

    private func listenForAliyunAsrEvents() {
        aliyunTask?.receive { [weak self] result in
            guard let self else { return }
            DispatchQueue.main.async {
                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self.handleAliyunAsrText(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleAliyunAsrText(text)
                        }
                    @unknown default:
                        break
                    }
                    if self.aliyunTask != nil {
                        self.listenForAliyunAsrEvents()
                    }
                case .failure(let error):
                    self.finishAliyunRecognition(error: error)
                }
            }
        }
    }

    private func handleAliyunAsrText(_ text: String) {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
              let header = object["header"] as? [String: Any] else {
            return
        }

        let event = header["event"] as? String ?? ""
        if event == "task-started" {
            aliyunTaskStarted = true
            flushAliyunAudioQueue()
            return
        }

        if event == "result-generated" {
            guard let payload = object["payload"] as? [String: Any],
                  let output = payload["output"] as? [String: Any],
                  let sentence = output["sentence"] as? [String: Any] else {
                return
            }

            let nextText = sentenceTextFromAliyunSentence(sentence)
            let heartbeat = sentence["heartbeat"] as? Bool ?? false
            guard !heartbeat, !nextText.isEmpty else { return }

            if sentence["sentence_end"] as? Bool == true {
                aliyunInterimText = ""
                let beginTime = sentence["begin_time"].map { String(describing: $0) } ?? ""
                let endTime = sentence["end_time"].map { String(describing: $0) } ?? ""
                let segmentKey = "\(beginTime):\(endTime):\(nextText)"
                if !aliyunFinalSegmentKeys.contains(segmentKey) {
                    aliyunFinalSegmentKeys.insert(segmentKey)
                    aliyunFinalSegments.append(nextText)
                }
            } else {
                aliyunInterimText = nextText
            }

            let joined = ([aliyunFinalSegments.joined(separator: "\n"), aliyunInterimText]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: "\n"))
                .trimmingCharacters(in: .whitespacesAndNewlines)

            guard !joined.isEmpty else { return }
            let isFinal = sentence["sentence_end"] as? Bool == true
            let previousTranscript = lastTranscript
            lastTranscript = joined
            // Interim events follow actual speech closely. A final event can
            // arrive after the server-side silence timeout, so do not restart
            // the app's 3-second silence window for the same sentence.
            if !isFinal || previousTranscript.isEmpty {
                lastTranscriptChangedAt = Date()
            }
            if aliyunMode == .wake {
                wakeTranscript = joined
            }
            notifyListeners("voiceTranscript", data: [
                "text": joined,
                "isFinal": isFinal,
                "provider": "pisen-dashscope-asr"
            ])

            if aliyunMode == .wake, let phrase = detectWakePhrase(in: joined) {
                finishWakeWord(detected: true, phrase: phrase, text: joined)
            }
            return
        }

        if event == "task-finished" {
            if aliyunMode == .wake {
                finishWakeWord(detected: false, phrase: "", text: wakeTranscript)
            } else {
                finishRecognition(error: nil)
            }
            return
        }

        if event == "task-failed" {
            let message = (header["error_message"] as? String) ?? (header["error_code"] as? String) ?? "阿里云 ASR 任务失败。"
            finishAliyunRecognition(error: NSError(domain: "AIWorkbenchAliyunASR", code: -1, userInfo: [NSLocalizedDescriptionKey: message]))
        }
    }

    private func sentenceTextFromAliyunSentence(_ sentence: [String: Any]) -> String {
        if let text = sentence["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        guard let words = sentence["words"] as? [[String: Any]] else {
            return ""
        }

        return words
            .map { word in
                let text = word["text"] as? String ?? ""
                let punctuation = word["punctuation"] as? String ?? ""
                return "\(text)\(punctuation)"
            }
            .joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func finishAliyunRecognition(error: Error?) {
        if aliyunMode == .wake {
            finishWakeWord(detected: false, phrase: "", text: wakeTranscript, error: error)
        } else {
            finishRecognition(error: error)
        }
    }

    private func stopAliyunRecognition(sendFinish: Bool = true) {
        if sendFinish {
            sendAliyunFinishTask()
        }
        aliyunTask?.cancel(with: .goingAway, reason: nil)
        aliyunTask = nil
        aliyunSession?.invalidateAndCancel()
        aliyunSession = nil
        aliyunConfig = nil
        aliyunTaskStarted = false
        aliyunFinishSent = false
        aliyunAudioQueue = []
        aliyunFinalSegments = []
        aliyunFinalSegmentKeys = []
        aliyunInterimText = ""
        aliyunAudioConverter = nil
        aliyunTargetFormat = nil
    }

    private func pcm16Data(from buffer: AVAudioPCMBuffer) -> Data? {
        guard let converter = aliyunAudioConverter,
              let targetFormat = aliyunTargetFormat else {
            return nil
        }

        let ratio = targetFormat.sampleRate / max(buffer.format.sampleRate, 1)
        let frameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let converted = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity) else {
            return nil
        }

        var didProvideInput = false
        var conversionError: NSError?
        let status = converter.convert(to: converted, error: &conversionError) { _, outStatus in
            if didProvideInput {
                outStatus.pointee = .noDataNow
                return nil
            }
            didProvideInput = true
            outStatus.pointee = .haveData
            return buffer
        }

        guard status != .error,
              let channelData = converted.int16ChannelData,
              converted.frameLength > 0 else {
            return nil
        }

        let frameCount = Int(converted.frameLength)
        let channelCount = max(1, Int(targetFormat.channelCount))
        return Data(bytes: channelData[0], count: frameCount * channelCount * MemoryLayout<Int16>.size)
    }

    private func requestAliyunTts(
        text: String,
        voiceName: String,
        model: String,
        config: DashScopeVoiceConfig
    ) async throws -> Data {
        var request = URLRequest(url: URL(string: "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 45
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !config.workspaceId.isEmpty {
            request.setValue(config.workspaceId, forHTTPHeaderField: "X-DashScope-WorkSpace")
        }

        let body: [String: Any] = [
            "model": model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "cosyvoice-v3-flash" : model,
            "input": [
                "text": text,
                "voice": voiceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "longanhuan" : voiceName,
                "format": "wav",
                "sample_rate": 24_000
            ]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await URLSession.shared.data(for: request)
        let http = response as? HTTPURLResponse
        let statusCode = http?.statusCode ?? 0
        let contentType = http?.value(forHTTPHeaderField: "Content-Type") ?? ""

        guard (200..<300).contains(statusCode) else {
            let bodyText = String(data: data, encoding: .utf8) ?? ""
            throw NSError(
                domain: "AIWorkbenchAliyunTTS",
                code: statusCode,
                userInfo: [NSLocalizedDescriptionKey: "阿里云 TTS 请求失败 (\(statusCode))：\(String(bodyText.prefix(500)))"]
            )
        }

        if contentType.lowercased().contains("audio/") {
            return data
        }

        guard let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
              let output = json["output"] as? [String: Any],
              let audio = output["audio"] as? [String: Any] else {
            throw NSError(domain: "AIWorkbenchAliyunTTS", code: -1, userInfo: [NSLocalizedDescriptionKey: "阿里云 TTS 没有返回可播放音频。"])
        }

        if let base64Data = audio["data"] as? String {
            let raw = base64Data.contains(",") ? String(base64Data.split(separator: ",").last ?? "") : base64Data
            if let decoded = Data(base64Encoded: raw) {
                return decoded
            }
        }

        if let urlString = audio["url"] as? String,
           let url = URL(string: urlString) {
            let (audioData, audioResponse) = try await URLSession.shared.data(from: url)
            let audioStatus = (audioResponse as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(audioStatus) else {
                throw NSError(domain: "AIWorkbenchAliyunTTS", code: audioStatus, userInfo: [NSLocalizedDescriptionKey: "阿里云 TTS 音频下载失败。"])
            }
            return audioData
        }

        throw NSError(domain: "AIWorkbenchAliyunTTS", code: -1, userInfo: [NSLocalizedDescriptionKey: "阿里云 TTS 没有返回可播放音频。"])
    }

    private func playAliyunAudio(_ data: Data, call: CAPPluginCall) throws {
        stopSpeechPlayback()
        try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers, .defaultToSpeaker, .allowBluetooth])
        try AVAudioSession.sharedInstance().setActive(true, options: [])

        let playableData = try normalizedAliyunAudioData(data)
        let player = try AVAudioPlayer(data: playableData)
        player.delegate = self
        player.prepareToPlay()
        audioPlayer = player
        speechCall = call
        notifyListeners("speechState", data: ["state": "speaking"])
        if !player.play() {
            speechCall = nil
            audioPlayer = nil
            throw NSError(domain: "AIWorkbenchAliyunTTS", code: -2, userInfo: [NSLocalizedDescriptionKey: "阿里云 TTS 播放启动失败。"])
        }
    }

    private func normalizedAliyunAudioData(_ data: Data) throws -> Data {
        guard data.count >= 12 else {
            throw NSError(
                domain: "AIWorkbenchAliyunTTS",
                code: -4,
                userInfo: [NSLocalizedDescriptionKey: "阿里云 TTS 返回的音频不完整（\(data.count) bytes）。"]
            )
        }

        guard String(data: data.prefix(4), encoding: .ascii) == "RIFF",
              String(data: data[8..<12], encoding: .ascii) == "WAVE" else {
            return data
        }

        var repaired = data
        writeLittleEndianUInt32(UInt32(clamping: repaired.count - 8), to: &repaired, at: 4)

        var offset = 12
        while offset + 8 <= repaired.count {
            let chunkId = String(data: repaired[offset..<(offset + 4)], encoding: .ascii) ?? ""
            let declaredSize = Int(readLittleEndianUInt32(from: repaired, at: offset + 4))

            if chunkId == "data" {
                let actualSize = repaired.count - offset - 8
                writeLittleEndianUInt32(UInt32(clamping: actualSize), to: &repaired, at: offset + 4)
                return repaired
            }

            let nextOffset = offset + 8 + declaredSize + (declaredSize % 2)
            guard nextOffset > offset, nextOffset <= repaired.count else {
                break
            }
            offset = nextOffset
        }

        throw NSError(
            domain: "AIWorkbenchAliyunTTS",
            code: -5,
            userInfo: [NSLocalizedDescriptionKey: "阿里云 TTS 返回的 WAV 缺少音频数据块（\(data.count) bytes）。"]
        )
    }

    private func readLittleEndianUInt32(from data: Data, at offset: Int) -> UInt32 {
        UInt32(data[offset])
            | (UInt32(data[offset + 1]) << 8)
            | (UInt32(data[offset + 2]) << 16)
            | (UInt32(data[offset + 3]) << 24)
    }

    private func writeLittleEndianUInt32(_ value: UInt32, to data: inout Data, at offset: Int) {
        data[offset] = UInt8(truncatingIfNeeded: value)
        data[offset + 1] = UInt8(truncatingIfNeeded: value >> 8)
        data[offset + 2] = UInt8(truncatingIfNeeded: value >> 16)
        data[offset + 3] = UInt8(truncatingIfNeeded: value >> 24)
    }

    private func finishRecognition(error: Error?, fallbackMessage: String? = nil) {
        let call = activeCall
        activeCall = nil

        timeoutTimer?.invalidate()
        timeoutTimer = nil
        silenceTimer?.invalidate()
        silenceTimer = nil
        recognitionFinishTimer?.invalidate()
        recognitionFinishTimer = nil

        if let engine = audioEngine {
            if engine.isRunning {
                engine.stop()
            }
            engine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil
        stopAliyunRecognition(sendFinish: error == nil)

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        guard let call else {
            return
        }

        let text = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        lastTranscript = ""

        if let fallbackMessage {
            call.reject(fallbackMessage, "VOICE_PERMISSION_DENIED")
            return
        }

        if let error, text.isEmpty, !isQuietSpeechError(error) {
            call.reject("语音识别失败：\(safeVoiceError(error))", "VOICE_RECOGNITION_FAILED", error)
            return
        }

        call.resolve([
            "ok": true,
            "text": text
        ])
    }

    private func finishRecognitionIfSilent() {
        guard activeCall != nil, !lastTranscript.isEmpty, let lastTranscriptChangedAt else {
            return
        }

        if Date().timeIntervalSince(lastTranscriptChangedAt) >= activeSilenceSeconds {
            requestRecognitionFinish()
        }
    }

    private func requestRecognitionFinish() {
        guard activeCall != nil else { return }
        guard recognitionFinishTimer == nil else { return }

        timeoutTimer?.invalidate()
        timeoutTimer = nil
        silenceTimer?.invalidate()
        silenceTimer = nil

        if let engine = audioEngine {
            if engine.isRunning {
                engine.stop()
            }
            engine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil

        sendAliyunFinishTask()
        recognitionFinishTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
            DispatchQueue.main.async {
                self?.finishRecognition(error: nil)
            }
        }
    }

    private func finishWakeWord(
        detected: Bool,
        phrase: String,
        text: String,
        error: Error? = nil,
        fallbackMessage: String? = nil
    ) {
        let call = wakeCall
        wakeCall = nil

        wakeTimeoutTimer?.invalidate()
        wakeTimeoutTimer = nil

        if let engine = wakeAudioEngine {
            if engine.isRunning {
                engine.stop()
            }
            engine.inputNode.removeTap(onBus: 0)
        }
        wakeAudioEngine = nil
        stopAliyunRecognition(sendFinish: error == nil)

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        guard let call else {
            return
        }

        if let fallbackMessage {
            call.reject(fallbackMessage, "VOICE_PERMISSION_DENIED")
            return
        }

        if let error, !detected, !isQuietSpeechError(error) {
            call.reject("唤醒词监听失败：\(safeVoiceError(error))", "WAKE_WORD_FAILED", error)
            return
        }

        call.resolve([
            "ok": true,
            "detected": detected,
            "phrase": phrase,
            "text": text.trimmingCharacters(in: .whitespacesAndNewlines)
        ])
    }

    private func detectWakePhrase(in text: String) -> String? {
        let normalizedText = normalizeWakeText(text)
        return wakePhrases.first { phrase in
            let normalizedPhrase = normalizeWakeText(phrase)
            return !normalizedPhrase.isEmpty && normalizedText.contains(normalizedPhrase)
        }
    }

    private func normalizeWakeText(_ text: String) -> String {
        let separators = CharacterSet.whitespacesAndNewlines
            .union(.punctuationCharacters)
            .union(CharacterSet(charactersIn: "，。！？、,.!?"))
        return text
            .lowercased()
            .components(separatedBy: separators)
            .joined()
    }

    private func isQuietSpeechError(_ error: Error) -> Bool {
        let message = safeVoiceError(error).lowercased()

        return message.contains("no speech")
            || message.contains("no input")
            || message.contains("cancel")
            || message.contains("aborted")
            || message.contains("cancelled")
    }

    private func stopSpeechPlayback() {
        if let player = audioPlayer {
            player.stop()
            audioPlayer = nil
        }
        if let call = speechCall {
            speechCall = nil
            call.resolve(["ok": true, "provider": "pisen-aliyun-tts", "interrupted": true])
        }
        notifyListeners("speechState", data: ["state": "idle"])
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        if audioPlayer === player {
            audioPlayer = nil
        }
        if let call = speechCall {
            speechCall = nil
            call.resolve(["ok": true, "provider": "pisen-aliyun-tts"])
        }
        notifyListeners("speechState", data: ["state": "idle"])
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    public func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        if audioPlayer === player {
            audioPlayer = nil
        }
        if let call = speechCall {
            speechCall = nil
            call.reject("阿里云 TTS 播放失败：\(safeVoiceError(error ?? NSError(domain: "AIWorkbenchAliyunTTS", code: -3)))", "ALIYUN_TTS_PLAY_FAILED", error)
        }
        notifyListeners("speechState", data: ["state": "idle"])
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func safeVoiceError(_ error: Error) -> String {
        if let localized = (error as? LocalizedError)?.errorDescription, !localized.isEmpty {
            return localized
        }

        let message = String(describing: error)
        return message.replacingOccurrences(of: "\n", with: " ")
    }
}

private enum SSHWorkbenchError: LocalizedError {
    case missingField(String)
    case keychainStatus(OSStatus)

    var errorDescription: String? {
        switch self {
        case .missingField(let field):
            return "Missing required field: \(field)"
        case .keychainStatus(let status):
            return "Keychain operation failed with status \(status)"
        }
    }
}

private final class PinnedAgentSessionDelegate: NSObject, URLSessionDelegate {
    private let expectedFingerprint: String

    init(expectedFingerprint: String) {
        self.expectedFingerprint = expectedFingerprint
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        guard let certificate = SecTrustGetCertificateAtIndex(trust, 0) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        let certificateData = SecCertificateCopyData(certificate) as Data
        let actualFingerprint = Data(SHA256.hash(data: certificateData)).base64EncodedString()
        guard !expectedFingerprint.isEmpty,
              actualFingerprint == expectedFingerprint else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
}

@objc(SSHWorkbenchPlugin)
public class SSHWorkbenchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SSHWorkbenchPlugin"
    public let jsName = "SSHWorkbench"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connectSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnectSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runCommand", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "agentRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTerminal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeTerminal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resizeTerminal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeTerminal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "routeIntent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveProfile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadProfile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearProfile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendLog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportLogs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearLogs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAppCache", returnType: CAPPluginReturnPromise)
    ]

    private let keychainService = "com.beexofficial.aiworkbench.connection"
    private let keychainAccount = "default-profile"
    private let simulatorProfileFallbackKey = "com.beexofficial.aiworkbench.simulator-profile"
    private let diagnosticLogQueue = DispatchQueue(label: "com.beexofficial.aiworkbench.diagnostics")
    private let commandSessions = NativeCommandSessionStore()
    private let terminalSessions = NativeTerminalSessionStore()
    private static let crc32Table: [UInt32] = {
        (0..<256).map { index in
            var value = UInt32(index)
            for _ in 0..<8 {
                value = (value & 1) == 1 ? 0xedb88320 ^ (value >> 1) : value >> 1
            }
            return value
        }
    }()

    @objc func connectSession(_ call: CAPPluginCall) {
        do {
            let config = try SSHConnectionConfig(call: call)
            guard !config.sessionId.isEmpty else {
                throw SSHWorkbenchError.missingField("sessionId")
            }
            notifyConnectionState(sessionId: config.sessionId, state: "connecting", detail: "")
            Task {
                do {
                    if await self.commandSessions.client(
                        for: config.sessionId,
                        fingerprint: config.connectionFingerprint
                    ) == nil {
                        let client = try await self.createSSHClient(config: config)
                        _ = await self.commandSessions.store(
                            client,
                            fingerprint: config.connectionFingerprint,
                            sessionId: config.sessionId
                        )
                    }
                    self.notifyConnectionState(sessionId: config.sessionId, state: "connected", detail: "")
                    call.resolve(["ok": true, "sessionId": config.sessionId, "state": "connected"])
                } catch {
                    self.notifyConnectionState(
                        sessionId: config.sessionId,
                        state: "error",
                        detail: self.friendlySSHErrorMessage(error, config: config)
                    )
                    call.reject(self.friendlySSHErrorMessage(error, config: config), "SSH_CONNECTION_FAILED", error)
                }
            }
        } catch {
            call.reject(safeErrorMessage(error), "SSH_CONFIG_INVALID", error)
        }
    }

    @objc func disconnectSession(_ call: CAPPluginCall) {
        let sessionId = (call.getString("sessionId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sessionId.isEmpty else {
            call.reject("Missing required field: sessionId", "SSH_CONFIG_INVALID")
            return
        }
        let preserveTransport = call.getBool("preserveTransport", false)
        Task {
            _ = await self.commandSessions.detach(sessionId, preserveTransport: preserveTransport)
            self.notifyConnectionState(sessionId: sessionId, state: "closed", detail: "已断开")
            call.resolve(["ok": true, "sessionId": sessionId])
        }
    }

    @objc func runCommand(_ call: CAPPluginCall) {
        let startedAt = Date()

        do {
            let config = try SSHConnectionConfig(call: call)
            guard let command = call.getString("command")?.trimmingCharacters(in: .whitespacesAndNewlines), !command.isEmpty else {
                throw SSHWorkbenchError.missingField("command")
            }
            let maxResponseSize = max(1024, min(call.getInt("maxResponseSize", 1_048_576), 83_886_080))
            let requestId = String(UUID().uuidString.prefix(8))
            let commandKind = config.uploadScript ? "uploaded-powershell" : (config.stdin.isEmpty ? "exec" : "stdin")
            appendDiagnosticLog("info", "ssh.native.start", fields: [
                "requestId": requestId,
                "host": config.host,
                "port": config.port,
                "username": config.username,
                "passwordLength": config.password.count,
                "commandKind": commandKind,
                "commandLength": command.count,
                "stdinLength": config.stdin.count,
                "connectTimeoutSeconds": config.connectTimeoutSeconds,
                "commandTimeoutSeconds": config.commandTimeoutSeconds,
                "maxResponseSize": maxResponseSize
            ])

            Task {
                do {
                    let output = try await self.executeWithRetry(command: command, config: config, maxResponseSize: maxResponseSize, requestId: requestId)
                    self.appendDiagnosticLog("info", "ssh.native.success", fields: [
                        "requestId": requestId,
                        "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
                        "outputLength": output.count
                    ])
                    call.resolve([
                        "ok": true,
                        "stdout": output,
                        "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000)
                    ])
                } catch {
                    self.appendDiagnosticLog("error", "ssh.native.failed", fields: [
                        "requestId": requestId,
                        "host": config.host,
                        "port": config.port,
                        "username": config.username,
                        "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
                        "error": self.safeErrorMessage(error),
                        "friendlyError": self.friendlySSHErrorMessage(error, config: config)
                    ])
                    call.reject(self.friendlySSHErrorMessage(error, config: config), "SSH_COMMAND_FAILED", error)
                }
            }
        } catch {
            appendDiagnosticLog("error", "ssh.native.config_invalid", fields: [
                "error": safeErrorMessage(error)
            ])
            call.reject(safeErrorMessage(error), "SSH_CONFIG_INVALID", error)
        }
    }

    @objc func agentRequest(_ call: CAPPluginCall) {
        guard let endpoint = call.getString("endpoint"), let baseURL = URL(string: endpoint),
              let accessToken = call.getString("accessToken"), !accessToken.isEmpty else {
            call.reject("Agent 直连配置不完整。", "AGENT_REQUEST_INVALID")
            return
        }
        let path = call.getString("path") ?? "/"
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            call.reject("Agent 请求地址无效。", "AGENT_REQUEST_INVALID")
            return
        }
        let allowInsecure = call.getBool("allowInsecure", false)
        let expectedFingerprint = (call.getString("tlsFingerprint") ?? "")
            .replacingOccurrences(of: "sha256/", with: "", options: [.caseInsensitive])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if url.scheme == "http" && !allowInsecure {
            call.reject("Agent 未启用 TLS，拒绝使用不加密连接。", "AGENT_TLS_REQUIRED")
            return
        }
        if url.scheme == "https" && expectedFingerprint.isEmpty {
            call.reject("缺少 Agent TLS 证书指纹，无法建立安全连接。", "AGENT_TLS_FINGERPRINT_MISSING")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = (call.getString("method") ?? "GET").uppercased()
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        if let body = call.getObject("body") {
            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: body)
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            } catch {
                call.reject("Agent 请求内容无效。", "AGENT_REQUEST_INVALID", error)
                return
            }
        }
        let timeoutMs = max(1_000, min(call.getInt("timeoutMs", 12_000), 120_000))
        request.timeoutInterval = TimeInterval(timeoutMs) / 1000
        let delegate = PinnedAgentSessionDelegate(expectedFingerprint: expectedFingerprint)
        let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
        session.dataTask(with: request) { data, response, error in
            if let error {
                call.reject(self.safeErrorMessage(error), "AGENT_REQUEST_FAILED", error)
                return
            }
            guard let response = response as? HTTPURLResponse else {
                call.reject("Agent 没有返回有效响应。", "AGENT_REQUEST_FAILED")
                return
            }
            call.resolve([
                "status": response.statusCode,
                "body": String(data: data ?? Data(), encoding: .utf8) ?? ""
            ])
        }.resume()
    }

    @objc func startTerminal(_ call: CAPPluginCall) {
        let terminalId = (call.getString("terminalId") ?? UUID().uuidString)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let workdir = (call.getString("workdir") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let platform = (call.getString("platform") ?? "linux").lowercased()
        let cols = max(20, call.getInt("cols", 80))
        let rows = max(6, call.getInt("rows", 24))

        guard !terminalId.isEmpty else {
            call.reject("Missing required field: terminalId", "SSH_TERMINAL_INVALID")
            return
        }

        do {
            let config = try SSHConnectionConfig(call: call)
            emitTerminalState(terminalId: terminalId, state: "connecting", detail: "")

            Task {
                await self.terminalSessions.prepare(terminalId)
                var settings = SSHClientSettings(
                    host: config.host,
                    port: config.port,
                    authenticationMethod: {
                        .passwordBased(username: config.username, password: config.password)
                    },
                    hostKeyValidator: .custom(PinnedSSHHostKeyValidator(expectedFingerprint: config.sshHostKeyFingerprint))
                )
                settings.connectTimeout = .seconds(config.connectTimeoutSeconds)
                var didResolve = false

                do {
                    let client = try await SSHClient.connect(to: settings)
                    guard await self.terminalSessions.attach(client: client, terminalId: terminalId) else {
                        try? await client.close()
                        return
                    }

                    try await client.withPTY(
                        SSHChannelRequestEvent.PseudoTerminalRequest(
                            wantReply: true,
                            term: "xterm-256color",
                            terminalCharacterWidth: cols,
                            terminalRowHeight: rows,
                            terminalPixelWidth: 0,
                            terminalPixelHeight: 0,
                            terminalModes: .init([.ECHO: 1])
                        )
                    ) { inbound, outbound in
                        guard await self.terminalSessions.attach(writer: outbound, terminalId: terminalId) else {
                            return
                        }

                        didResolve = true
                        call.resolve(["ok": true, "terminalId": terminalId])
                        self.emitTerminalState(terminalId: terminalId, state: "connected", detail: "")

                        if !workdir.isEmpty {
                            let command: String
                            if platform.contains("windows") && !platform.contains("wsl") {
                                command = "Set-Location -LiteralPath \(self.powershellLiteral(workdir))\r"
                            } else {
                                command = "cd -- \(self.shellLiteral(workdir))\r"
                            }
                            try await self.terminalSessions.write(
                                Data(command.utf8),
                                terminalId: terminalId
                            )
                        }

                        for try await output in inbound {
                            switch output {
                            case .stdout(var buffer), .stderr(var buffer):
                                guard let bytes = buffer.readBytes(length: buffer.readableBytes), !bytes.isEmpty else {
                                    continue
                                }
                                self.emitTerminalData(
                                    terminalId: terminalId,
                                    data: Data(bytes)
                                )
                            }
                        }
                    }

                    let wasActive = await self.terminalSessions.finish(terminalId)
                    if wasActive {
                        self.emitTerminalState(
                            terminalId: terminalId,
                            state: "closed",
                            detail: "远端 SSH 已断开"
                        )
                    }
                } catch {
                    let wasActive = await self.terminalSessions.finish(terminalId)
                    let message = self.friendlySSHErrorMessage(error, config: config)
                    if !didResolve {
                        call.reject(message, "SSH_TERMINAL_FAILED", error)
                    }
                    if wasActive {
                        self.emitTerminalState(
                            terminalId: terminalId,
                            state: "error",
                            detail: message
                        )
                    }
                }
            }
        } catch {
            call.reject(safeErrorMessage(error), "SSH_TERMINAL_INVALID", error)
        }
    }

    @objc func writeTerminal(_ call: CAPPluginCall) {
        let terminalId = (call.getString("terminalId") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let text = call.getString("data") ?? ""
        let base64 = call.getString("base64") ?? ""
        let data = !base64.isEmpty ? Data(base64Encoded: base64) : Data(text.utf8)

        guard !terminalId.isEmpty, let data else {
            call.reject("SSH 终端输入无效。", "SSH_TERMINAL_WRITE_INVALID")
            return
        }

        Task {
            do {
                try await self.terminalSessions.write(data, terminalId: terminalId)
                call.resolve(["ok": true])
            } catch {
                call.reject(self.safeErrorMessage(error), "SSH_TERMINAL_WRITE_FAILED", error)
            }
        }
    }

    @objc func resizeTerminal(_ call: CAPPluginCall) {
        let terminalId = (call.getString("terminalId") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let cols = call.getInt("cols", 80)
        let rows = call.getInt("rows", 24)

        guard !terminalId.isEmpty else {
            call.reject("SSH 终端会话不存在。", "SSH_TERMINAL_RESIZE_INVALID")
            return
        }

        Task {
            do {
                try await self.terminalSessions.resize(
                    terminalId: terminalId,
                    cols: cols,
                    rows: rows
                )
                call.resolve(["ok": true])
            } catch {
                call.reject(self.safeErrorMessage(error), "SSH_TERMINAL_RESIZE_FAILED", error)
            }
        }
    }

    @objc func closeTerminal(_ call: CAPPluginCall) {
        let terminalId = (call.getString("terminalId") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        Task {
            if !terminalId.isEmpty {
                await self.terminalSessions.close(terminalId)
                self.emitTerminalState(
                    terminalId: terminalId,
                    state: "closed",
                    detail: "SSH 连接已关闭"
                )
            }
            call.resolve(["ok": true])
        }
    }

    @objc func saveFile(_ call: CAPPluginCall) {
        guard let rawBase64 = call.getString("base64"), !rawBase64.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("Missing required field: base64", "FILE_SAVE_INVALID")
            return
        }

        let fileName = safeDownloadFileName(call.getString("name") ?? "download")
        let base64 = rawBase64.contains(",") ? String(rawBase64.split(separator: ",").last ?? "") : rawBase64
        guard let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]) else {
            call.reject("文件内容不是有效的 base64。", "FILE_SAVE_INVALID")
            return
        }

        do {
            let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try data.write(to: fileURL, options: .atomic)

            DispatchQueue.main.async {
                guard let viewController = self.bridge?.viewController else {
                    call.reject("当前没有可用窗口来打开分享面板。", "FILE_SAVE_UNAVAILABLE")
                    return
                }

                let activity = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
                if let popover = activity.popoverPresentationController {
                    popover.sourceView = viewController.view
                    popover.sourceRect = CGRect(
                        x: viewController.view.bounds.midX,
                        y: viewController.view.bounds.maxY - 24,
                        width: 1,
                        height: 1
                    )
                    popover.permittedArrowDirections = []
                }

                viewController.present(activity, animated: true)
                // The file is already written and handed to the system share
                // sheet. Resolve immediately so a background transition cannot
                // leave the web UI permanently stuck in “下载中”.
                call.resolve(["ok": true, "path": fileURL.path])
            }
        } catch {
            call.reject("保存文件失败：\(safeErrorMessage(error))", "FILE_SAVE_FAILED", error)
        }
    }

    @objc func haptic(_ call: CAPPluginCall) {
        let kind = (call.getString("kind") ?? call.getString("style") ?? "light").lowercased()

        DispatchQueue.main.async {
            switch kind {
            case "success":
                let generator = UINotificationFeedbackGenerator()
                generator.prepare()
                generator.notificationOccurred(.success)
            case "warning":
                let generator = UINotificationFeedbackGenerator()
                generator.prepare()
                generator.notificationOccurred(.warning)
            case "error":
                let generator = UINotificationFeedbackGenerator()
                generator.prepare()
                generator.notificationOccurred(.error)
            case "medium":
                let generator = UIImpactFeedbackGenerator(style: .medium)
                generator.prepare()
                generator.impactOccurred()
            default:
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.prepare()
                generator.impactOccurred()
            }
            call.resolve(["ok": true])
        }
    }

    @objc func routeIntent(_ call: CAPPluginCall) {
        guard let apiKey = call.getString("apiKey")?.trimmingCharacters(in: .whitespacesAndNewlines), !apiKey.isEmpty else {
            call.reject("Missing required field: OpenAI API key", "OPENAI_CONFIG_INVALID")
            return
        }
        guard let requestBody = call.getObject("requestBody") else {
            call.reject("Missing required field: requestBody", "OPENAI_CONFIG_INVALID")
            return
        }

        let timeoutSeconds = max(5, min(call.getInt("timeoutSeconds", 20), 60))

        Task {
            do {
                let bodyData = try JSONSerialization.data(withJSONObject: requestBody, options: [])
                var request = URLRequest(url: URL(string: "https://api.openai.com/v1/responses")!)
                request.httpMethod = "POST"
                request.timeoutInterval = TimeInterval(timeoutSeconds)
                request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = bodyData

                let (data, response) = try await URLSession.shared.data(for: request)
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                let responseBody = String(data: data, encoding: .utf8) ?? ""

                guard (200..<300).contains(statusCode) else {
                    throw NSError(
                        domain: "AIWorkbenchOpenAI",
                        code: statusCode,
                        userInfo: [NSLocalizedDescriptionKey: "OpenAI request failed (\(statusCode)): \(String(responseBody.prefix(500)))"]
                    )
                }

                call.resolve([
                    "ok": true,
                    "status": statusCode,
                    "body": responseBody
                ])
            } catch {
                call.reject("主 AI 分流失败：\(self.safeErrorMessage(error))", "OPENAI_ROUTE_FAILED", error)
            }
        }
    }

    @objc func saveProfile(_ call: CAPPluginCall) {
        do {
            let profile = call.getObject("profile", [:])
            let data = try JSONSerialization.data(withJSONObject: profile, options: [])
            appendDiagnosticLog("info", "profile.native.save.start", fields: profileSummary(profile).merging([
                "bytes": data.count
            ]) { current, _ in current })
            try savePersistedProfileData(data)
            appendDiagnosticLog("info", "profile.native.save.success", fields: profileSummary(profile).merging([
                "bytes": data.count
            ]) { current, _ in current })
            call.resolve(["ok": true])
        } catch {
            appendDiagnosticLog("error", "profile.native.save.failed", fields: [
                "error": safeErrorMessage(error)
            ])
            call.reject("Could not save connection profile: \(safeErrorMessage(error))", "KEYCHAIN_SAVE_FAILED", error)
        }
    }

    @objc func loadProfile(_ call: CAPPluginCall) {
        do {
            guard let data = try loadPersistedProfileData() else {
                appendDiagnosticLog("warn", "profile.native.load.missing", fields: [:])
                call.resolve(["profile": [:]])
                return
            }

            let object = try JSONSerialization.jsonObject(with: data, options: [])
            guard let dictionary = object as? [String: Any] else {
                throw NSError(
                    domain: "AIWorkbenchProfile",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Saved profile is not a JSON object"]
                )
            }
            let profile = try makeJSObject(dictionary)
            appendDiagnosticLog("info", "profile.native.load.success", fields: profileSummary(profile).merging([
                "bytes": data.count
            ]) { current, _ in current })
            call.resolve(["profile": profile])
        } catch {
            appendDiagnosticLog("error", "profile.native.load.failed", fields: [
                "error": safeErrorMessage(error)
            ])
            call.reject("Could not load connection profile: \(safeErrorMessage(error))", "KEYCHAIN_LOAD_FAILED", error)
        }
    }

    private func makeJSObject(_ dictionary: [String: Any]) throws -> JSObject {
        var object: JSObject = [:]
        for (key, value) in dictionary {
            object[key] = try makeJSValue(value)
        }
        return object
    }

    private func makeJSValue(_ value: Any) throws -> any JSValue {
        switch value {
        case let value as String:
            return value
        case let value as Bool:
            return value
        case let value as NSNumber:
            return value
        case let value as NSNull:
            return value
        case let value as [Any]:
            return try value.map(makeJSValue)
        case let value as [String: Any]:
            return try makeJSObject(value)
        default:
            throw NSError(
                domain: "AIWorkbenchProfile",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Saved profile contains an unsupported JSON value"]
            )
        }
    }

    @objc func clearProfile(_ call: CAPPluginCall) {
        do {
            try deletePersistedProfileData()
            appendDiagnosticLog("warn", "profile.native.clear", fields: [:])
            call.resolve(["ok": true])
        } catch {
            appendDiagnosticLog("error", "profile.native.clear.failed", fields: [
                "error": safeErrorMessage(error)
            ])
            call.reject("Could not clear connection profile: \(safeErrorMessage(error))", "KEYCHAIN_CLEAR_FAILED", error)
        }
    }

    @objc func appendLog(_ call: CAPPluginCall) {
        appendDiagnosticLog(
            call.getString("level") ?? "info",
            call.getString("event") ?? "renderer.event",
            fields: call.getObject("fields", [:])
        )
        call.resolve(["ok": true])
    }

    @objc func getAppInfo(_ call: CAPPluginCall) {
        call.resolve(appInfoPayload())
    }

    private func appInfoPayload() -> [String: Any] {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? ""
        let build = info["CFBundleVersion"] as? String ?? ""
        let name =
            info["CFBundleDisplayName"] as? String ??
            info["CFBundleName"] as? String ??
            "AI Workbench"
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
        let idiom: String
        switch UIDevice.current.userInterfaceIdiom {
        case .pad:
            idiom = "ipad"
        case .phone:
            idiom = "iphone"
        case .mac:
            idiom = "mac"
        default:
            idiom = "ios"
        }

        return [
            "name": name,
            "version": version,
            "build": build,
            "displayVersion": !build.isEmpty && build != version ? "\(version) (\(build))" : version,
            "bundleIdentifier": bundleIdentifier,
            "platform": "ios",
            "device": idiom,
            "systemVersion": UIDevice.current.systemVersion,
            "packaged": true
        ]
    }

    @objc func exportLogs(_ call: CAPPluginCall) {
        let context = call.getObject("context", [:])
        appendDiagnosticLog("info", "diagnostics.export.requested", fields: context)

        diagnosticLogQueue.async {
            do {
                let fileURL = try self.buildDiagnosticsArchive(context: context)
                DispatchQueue.main.async {
                    guard let viewController = self.bridge?.viewController else {
                        call.reject("当前没有可用窗口来打开分享面板。", "DIAGNOSTICS_SHARE_UNAVAILABLE")
                        return
                    }

                    let activity = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
                    activity.completionWithItemsHandler = { _, completed, _, activityError in
                        if let activityError {
                            call.reject(
                                "分享诊断日志失败：\(self.safeErrorMessage(activityError))",
                                "DIAGNOSTICS_SHARE_FAILED",
                                activityError
                            )
                            return
                        }
                        call.resolve([
                            "ok": true,
                            "canceled": !completed,
                            "path": fileURL.path,
                            "name": fileURL.lastPathComponent
                        ])
                    }
                    if let popover = activity.popoverPresentationController {
                        popover.sourceView = viewController.view
                        popover.sourceRect = CGRect(
                            x: viewController.view.bounds.midX,
                            y: viewController.view.bounds.maxY - 24,
                            width: 1,
                            height: 1
                        )
                        popover.permittedArrowDirections = []
                    }

                    viewController.present(activity, animated: true)
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("导出诊断日志失败：\(self.safeErrorMessage(error))", "DIAGNOSTICS_EXPORT_FAILED", error)
                }
            }
        }
    }

    @objc func clearLogs(_ call: CAPPluginCall) {
        diagnosticLogQueue.async {
            do {
                let directory = try self.ensureDiagnosticLogDirectory()
                let files = try FileManager.default.contentsOfDirectory(
                    at: directory,
                    includingPropertiesForKeys: nil
                )
                for file in files where file.lastPathComponent.hasSuffix(".jsonl") {
                    try FileManager.default.removeItem(at: file)
                }
                DispatchQueue.main.async {
                    call.resolve(["ok": true])
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject(
                        "清空诊断日志失败：\(self.safeErrorMessage(error))",
                        "DIAGNOSTICS_CLEAR_FAILED",
                        error
                    )
                }
            }
        }
    }

    @objc func clearAppCache(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let dataStore = WKWebsiteDataStore.default()
            let cacheTypes: Set<String> = [
                WKWebsiteDataTypeDiskCache,
                WKWebsiteDataTypeMemoryCache,
                WKWebsiteDataTypeOfflineWebApplicationCache
            ]
            dataStore.removeData(ofTypes: cacheTypes, modifiedSince: .distantPast) {
                call.resolve(["ok": true])
            }
        }
    }

    private func executeWithRetry(command: String, config: SSHConnectionConfig, maxResponseSize: Int, requestId: String) async throws -> String {
        do {
            return try await execute(command: command, config: config, maxResponseSize: maxResponseSize)
        } catch {
            guard shouldRetrySSH(error) else {
                throw error
            }
            appendDiagnosticLog("warn", "ssh.native.retry", fields: [
                "requestId": requestId,
                "host": config.host,
                "port": config.port,
                "error": safeErrorMessage(error)
            ])
            try await Task.sleep(nanoseconds: 350_000_000)
            return try await execute(command: command, config: config, maxResponseSize: maxResponseSize)
        }
    }

    private func shouldRetrySSH(_ error: Error) -> Bool {
        let message = safeErrorMessage(error).lowercased()
        if message.contains("auth") || message.contains("password") || message.contains("permission denied") {
            return false
        }
        return message.contains("connection reset")
            || message.contains("connection closed")
            || message.contains("channel closed")
            || message.contains("tcpshutdown")
            || message.contains("timed out")
            || message.contains("eof")
    }

    private func isPrivateNetworkHost(_ host: String) -> Bool {
        let value = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if value == "localhost" || value == "127.0.0.1" || value.hasPrefix("192.168.") || value.hasPrefix("10.") {
            return true
        }
        let parts = value.split(separator: ".").compactMap { Int($0) }
        if parts.count == 4, parts[0] == 172, (16...31).contains(parts[1]) {
            return true
        }
        return false
    }

    private func friendlySSHErrorMessage(_ error: Error, config: SSHConnectionConfig) -> String {
        let raw = safeErrorMessage(error)
        let message = raw.lowercased()
        if raw.hasPrefix("SSH_HOST_KEY_UNTRUSTED:") || raw.hasPrefix("SSH_HOST_KEY_CHANGED:") {
            return raw
        }
        if message.contains("auth") || message.contains("password") || message.contains("authentication") {
            return "SSH 登录失败：请检查用户名和登录密码。原始错误：\(raw)"
        }
        if message.contains("refused") {
            return "连接被拒绝：请确认这台机器已开启 SSH，端口 \(config.port) 没有被防火墙拦截。原始错误：\(raw)"
        }
        if message.contains("tcpshutdown")
            || message.contains("connection reset")
            || message.contains("connection closed")
            || message.contains("channel closed")
            || message.contains("eof") {
            return "连接断开"
        }
        if isPrivateNetworkHost(config.host),
           message.contains("timed out")
            || message.contains("timeout")
            || message.contains("unreachable")
            || message.contains("no route")
            || message.contains("network")
            || message.contains("operation not permitted")
            || message.contains("connection") {
            return "局域网机器连接失败：\(config.host) 是内网地址，请确认 iPhone 和这台 Windows 电脑在同一个 Wi-Fi/Tailscale 网络，并在系统设置 > AI Workbench 中允许“本地网络”。原始错误：\(raw)"
        }
        if message.contains("timed out") || message.contains("timeout") {
            return "SSH 连接超时：请确认网络可达、端口 \(config.port) 已开放，或者稍后重试。原始错误：\(raw)"
        }
        if message.contains("unable to exec") {
            return "SSH 已连上，但远端系统拒绝执行命令。Windows 机器请确认 OpenSSH Server 可以执行 PowerShell。原始错误：\(raw)"
        }
        return "SSH command failed: \(raw)"
    }

    private func createSSHClient(config: SSHConnectionConfig) async throws -> SSHClient {
        var settings = SSHClientSettings(
            host: config.host,
            port: config.port,
            authenticationMethod: {
                .passwordBased(username: config.username, password: config.password)
            },
            hostKeyValidator: .custom(PinnedSSHHostKeyValidator(expectedFingerprint: config.sshHostKeyFingerprint))
        )
        settings.connectTimeout = .seconds(config.connectTimeoutSeconds)
        return try await SSHClient.connect(to: settings)
    }

    private func execute(command: String, config: SSHConnectionConfig, maxResponseSize: Int) async throws -> String {
        let persistent = !config.sessionId.isEmpty
        let existingClient = persistent
            ? await commandSessions.client(
                for: config.sessionId,
                fingerprint: config.connectionFingerprint
            )
            : nil
        let client: SSHClient
        if let existingClient {
            client = existingClient
        } else {
            let createdClient = try await createSSHClient(config: config)
            if persistent {
                client = await commandSessions.store(
                    createdClient,
                    fingerprint: config.connectionFingerprint,
                    sessionId: config.sessionId
                )
                notifyConnectionState(sessionId: config.sessionId, state: "connected", detail: "")
            } else {
                client = createdClient
            }
        }
        do {
            if config.uploadScript && !config.stdin.isEmpty {
                let output = try await executeUploadedPowerShellScript(
                    client: client,
                    config: config,
                    maxResponseSize: maxResponseSize
                )
                if !persistent {
                    try? await client.close()
                }
                return output
            }
            let executableCommand = prepareExecutableCommand(command, config: config)
            var output = try await client.executeCommand(
                executableCommand,
                maxResponseSize: maxResponseSize,
                mergeStreams: true,
                inShell: false
            )
            let text = output.readString(length: output.readableBytes) ?? ""
            if !persistent {
                try? await client.close()
            }
            return text
        } catch {
            if persistent {
                let affectedSessionIds = await commandSessions.invalidate(config.sessionId)
                for affectedSessionId in affectedSessionIds {
                    notifyConnectionState(
                        sessionId: affectedSessionId,
                        state: "error",
                        detail: friendlySSHErrorMessage(error, config: config)
                    )
                }
            } else {
                try? await client.close()
            }
            throw error
        }
    }

    private func executeUploadedPowerShellScript(
        client: SSHClient,
        config: SSHConnectionConfig,
        maxResponseSize: Int
    ) async throws -> String {
        var tempOutput = try await client.executeCommand(
            "powershell -NoLogo -NoProfile -Command \"[System.IO.Path]::GetTempPath()\"",
            maxResponseSize: 16_384,
            mergeStreams: true,
            inShell: false
        )
        let tempText = tempOutput.readString(length: tempOutput.readableBytes) ?? ""
        let detectedTempDirectory = tempText
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { $0.range(of: #"^[A-Za-z]:[\\/]"#, options: .regularExpression) != nil }
        let tempDirectory = (detectedTempDirectory ?? "C:\\Windows\\Temp")
            .replacingOccurrences(of: #"[\\/]+$"#, with: "", options: .regularExpression)
        let remotePath = "\(tempDirectory)\\aiwb-\(UUID().uuidString).ps1"
        let remoteSftpPath = remotePath.replacingOccurrences(of: "\\", with: "/")
        let source = config.stdin.hasSuffix("\n") ? config.stdin : "\(config.stdin)\n"
        var scriptPayload = Data([0xef, 0xbb, 0xbf])
        scriptPayload.append(source.data(using: .utf8) ?? Data())
        let scriptData = scriptPayload

        try await client.withSFTP { sftp in
            try await sftp.withFile(
                filePath: remoteSftpPath,
                flags: [.write, .create, .truncate]
            ) { file in
                var buffer = ByteBufferAllocator().buffer(capacity: scriptData.count)
                buffer.writeBytes(scriptData)
                try await file.write(buffer)
            }
        }

        let quotedPath = powershellLiteral(remotePath)
        let wrapper = "& \(quotedPath); $AIWB_OK=$?; $AIWB_EXIT_CODE = if ($AIWB_OK) { 0 } else { 1 }; Write-Output \"__AIWB_SCRIPT_EXIT_CODE__$AIWB_EXIT_CODE\"; Remove-Item -LiteralPath \(quotedPath) -Force -ErrorAction SilentlyContinue; exit 0"
        let executableCommand = powershellEncodedCommand(wrapper)
        var output = try await client.executeCommand(
            executableCommand,
            maxResponseSize: maxResponseSize,
            mergeStreams: true,
            inShell: false
        )
        return output.readString(length: output.readableBytes) ?? ""
    }

    private func prepareExecutableCommand(_ command: String, config: SSHConnectionConfig) -> String {
        guard !config.stdin.isEmpty else {
            return command
        }

        let lowercasedCommand = command.lowercased()
        if config.uploadScript && lowercasedCommand.contains("powershell") {
            return powershellEncodedCommand(config.stdin)
        }
        if lowercasedCommand.contains("powershell") && lowercasedCommand.contains("-command -") {
            return powershellEncodedCommand(config.stdin)
        }

        return command
    }

    private func powershellEncodedCommand(_ script: String) -> String {
        let data = script.data(using: .utf16LittleEndian) ?? Data()
        let encoded = data.base64EncodedString()
        return "powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand \(encoded)"
    }

    private func powershellLiteral(_ value: String) -> String {
        return "'\(value.replacingOccurrences(of: "'", with: "''"))'"
    }

    private func shellLiteral(_ value: String) -> String {
        "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
    }

    private func emitTerminalData(terminalId: String, data: Data) {
        DispatchQueue.main.async {
            self.notifyListeners("terminalData", data: [
                "terminalId": terminalId,
                "base64": data.base64EncodedString()
            ])
        }
    }

    private func emitTerminalState(terminalId: String, state: String, detail: String) {
        DispatchQueue.main.async {
            self.notifyListeners("terminalState", data: [
                "terminalId": terminalId,
                "state": state,
                "detail": detail
            ])
        }
    }

    private func notifyConnectionState(sessionId: String, state: String, detail: String) {
        DispatchQueue.main.async {
            self.notifyListeners("connectionState", data: [
                "sessionId": sessionId,
                "state": state,
                "detail": detail
            ])
        }
    }

    private struct ZipEntry {
        let name: String
        let data: Data
        let date: Date
    }

    private func appendDiagnosticLog(_ level: String, _ event: String, fields: [String: Any] = [:]) {
        let safeFields = sanitizeDiagnosticValue(fields) as? [String: Any] ?? [:]
        diagnosticLogQueue.async {
            do {
                let directory = try self.ensureDiagnosticLogDirectory()
                let fileURL = directory.appendingPathComponent("ai-workbench-\(self.dayStamp()).jsonl")
                let entry: [String: Any] = [
                    "ts": ISO8601DateFormatter().string(from: Date()),
                    "level": level,
                    "event": event,
                    "fields": safeFields
                ]
                let data = try JSONSerialization.data(withJSONObject: entry, options: [])
                var line = Data(data)
                line.append(0x0a)
                if FileManager.default.fileExists(atPath: fileURL.path) {
                    let handle = try FileHandle(forWritingTo: fileURL)
                    try handle.seekToEnd()
                    try handle.write(contentsOf: line)
                    try handle.close()
                } else {
                    try line.write(to: fileURL, options: .atomic)
                }
                try self.trimDiagnosticLogs(in: directory)
            } catch {
                print("[AIWorkbench diagnostics] \(self.safeErrorMessage(error))")
            }
        }
    }

    private func ensureDiagnosticLogDirectory() throws -> URL {
        let directory = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AIWorkbenchDiagnostics", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func trimDiagnosticLogs(in directory: URL) throws {
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasSuffix(".jsonl") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        for file in files.dropLast(14) {
            try? FileManager.default.removeItem(at: file)
        }
    }

    private func buildDiagnosticsArchive(context: JSObject) throws -> URL {
        let directory = try ensureDiagnosticLogDirectory()
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasSuffix(".jsonl") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .suffix(14)

        let screenBounds = UIScreen.main.bounds
        let idiom: String
        switch UIDevice.current.userInterfaceIdiom {
        case .phone:
            idiom = "iphone"
        case .pad:
            idiom = "ipad"
        case .mac:
            idiom = "mac"
        case .tv:
            idiom = "tv"
        case .carPlay:
            idiom = "carplay"
        case .vision:
            idiom = "vision"
        default:
            idiom = "unknown"
        }

        let appInfo = appInfoPayload()
        var metadata: [String: Any] = [
            "exportedAt": ISO8601DateFormatter().string(from: Date()),
            "appVersion": appInfo["version"] as? String ?? "",
            "build": appInfo["build"] as? String ?? "",
            "app": appInfo,
            "systemName": UIDevice.current.systemName,
            "systemVersion": UIDevice.current.systemVersion,
            "model": UIDevice.current.model,
            "device": [
                "idiom": idiom,
                "screenWidth": Int(screenBounds.width),
                "screenHeight": Int(screenBounds.height),
                "screenScale": UIScreen.main.scale,
                "locale": Locale.current.identifier,
                "timeZone": TimeZone.current.identifier,
                "preferredContentSizeCategory": UIApplication.shared.preferredContentSizeCategory.rawValue
            ],
            "context": sanitizeDiagnosticValue(context)
        ]

        if let data = try? loadKeychainData() {
            metadata["storedProfileBytes"] = data.count
            if let object = try? JSONSerialization.jsonObject(with: data, options: []),
               let profile = object as? JSObject {
                metadata["storedProfileSummary"] = profileSummary(profile)
            }
        } else {
            metadata["storedProfileBytes"] = 0
        }

        var entries: [ZipEntry] = [
            ZipEntry(
                name: "diagnostics.json",
                data: try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted]),
                date: Date()
            )
        ]

        for file in files {
            entries.append(ZipEntry(name: "logs/\(file.lastPathComponent)", data: try Data(contentsOf: file), date: Date()))
        }

        let zip = makeZip(entries)
        let fileName = "AI-Workbench-diagnostics-\(ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")).zip"
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(safeDownloadFileName(fileName))
        try zip.write(to: fileURL, options: .atomic)
        appendDiagnosticLog("info", "diagnostics.export.created", fields: [
            "name": fileURL.lastPathComponent,
            "size": zip.count,
            "logFiles": files.count
        ])
        return fileURL
    }

    private func profileSummary(_ profile: JSObject) -> [String: Any] {
        let servers = profile["servers"] as? [JSObject] ?? []
        return [
            "version": profile["version"] as? Int ?? 0,
            "activeServerId": profile["activeServerId"] as? String ?? "",
            "serverCount": servers.count,
            "servers": servers.enumerated().map { index, server in
                let itemProfile = server["profile"] as? JSObject ?? [:]
                return [
                    "index": index + 1,
                    "id": server["id"] as? String ?? "",
                    "name": server["name"] as? String ?? itemProfile["name"] as? String ?? "",
                    "agentId": itemProfile["agentId"] as? String ?? "",
                    "platform": itemProfile["platform"] as? String ?? "",
                    "host": itemProfile["host"] as? String ?? "",
                    "port": itemProfile["port"] as? Int ?? 22,
                    "username": itemProfile["username"] as? String ?? "",
                    "workdir": itemProfile["workdir"] as? String ?? "",
                    "hasPassword": !((itemProfile["password"] as? String ?? "").isEmpty),
                    "passwordLength": (itemProfile["password"] as? String ?? "").count
                ]
            }
        ]
    }

    private func sanitizeDiagnosticValue(_ value: Any, depth: Int = 0) -> Any {
        if depth > 4 {
            return "[depth-limit]"
        }
        if value is NSNull {
            return value
        }
        if let text = value as? String {
            return text.count > 600 ? "\(text.prefix(600))...[truncated:\(text.count)]" : text
        }
        if let number = value as? NSNumber {
            return number
        }
        if let bool = value as? Bool {
            return bool
        }
        if let array = value as? [Any] {
            return array.prefix(80).map { sanitizeDiagnosticValue($0, depth: depth + 1) }
        }
        if let dict = value as? [String: Any] {
            var result: [String: Any] = [:]
            for (key, item) in dict {
                if isSensitiveDiagnosticKey(key) {
                    result[key] = "[redacted]"
                } else if isNoisyDiagnosticKey(key) {
                    result[key] = "[omitted]"
                } else {
                    result[key] = sanitizeDiagnosticValue(item, depth: depth + 1)
                }
            }
            return result
        }
        return String(describing: value)
    }

    private func isSensitiveDiagnosticKey(_ key: String) -> Bool {
        let lower = key.lowercased()
        return lower.contains("password")
            || lower.contains("token")
            || lower.contains("secret")
            || lower.contains("accesskey")
            || lower.contains("apikey")
            || lower.contains("api_key")
            || lower.contains("authorization")
            || lower.contains("credential")
            || lower.contains("base64")
    }

    private func isNoisyDiagnosticKey(_ key: String) -> Bool {
        let lower = key.lowercased()
        return lower == "body"
            || lower == "output"
            || lower == "stdout"
            || lower == "stderr"
            || lower == "requestbody"
            || lower == "rawoutput"
            || lower == "messages"
            || lower == "transcript"
    }

    private func dayStamp(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func dosDateFields(_ date: Date) -> (time: UInt16, date: UInt16) {
        let components = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let year = max(1980, components.year ?? 1980)
        let month = components.month ?? 1
        let day = components.day ?? 1
        let hour = components.hour ?? 0
        let minute = components.minute ?? 0
        let second = components.second ?? 0
        return (
            UInt16((hour << 11) | (minute << 5) | (second / 2)),
            UInt16(((year - 1980) << 9) | (month << 5) | day)
        )
    }

    private func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xffffffff
        for byte in data {
            crc = Self.crc32Table[Int((crc ^ UInt32(byte)) & 0xff)] ^ (crc >> 8)
        }
        return crc ^ 0xffffffff
    }

    private func appendUInt16LE(_ value: UInt16, to data: inout Data) {
        var little = value.littleEndian
        withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
    }

    private func appendUInt32LE(_ value: UInt32, to data: inout Data) {
        var little = value.littleEndian
        withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
    }

    private func makeZip(_ entries: [ZipEntry]) -> Data {
        var archive = Data()
        var central = Data()

        for entry in entries {
            let offset = UInt32(archive.count)
            let name = entry.name.replacingOccurrences(of: "\\", with: "/").data(using: .utf8) ?? Data()
            let checksum = crc32(entry.data)
            let dos = dosDateFields(entry.date)

            appendUInt32LE(0x04034b50, to: &archive)
            appendUInt16LE(20, to: &archive)
            appendUInt16LE(0, to: &archive)
            appendUInt16LE(0, to: &archive)
            appendUInt16LE(dos.time, to: &archive)
            appendUInt16LE(dos.date, to: &archive)
            appendUInt32LE(checksum, to: &archive)
            appendUInt32LE(UInt32(entry.data.count), to: &archive)
            appendUInt32LE(UInt32(entry.data.count), to: &archive)
            appendUInt16LE(UInt16(name.count), to: &archive)
            appendUInt16LE(0, to: &archive)
            archive.append(name)
            archive.append(entry.data)

            appendUInt32LE(0x02014b50, to: &central)
            appendUInt16LE(20, to: &central)
            appendUInt16LE(20, to: &central)
            appendUInt16LE(0, to: &central)
            appendUInt16LE(0, to: &central)
            appendUInt16LE(dos.time, to: &central)
            appendUInt16LE(dos.date, to: &central)
            appendUInt32LE(checksum, to: &central)
            appendUInt32LE(UInt32(entry.data.count), to: &central)
            appendUInt32LE(UInt32(entry.data.count), to: &central)
            appendUInt16LE(UInt16(name.count), to: &central)
            appendUInt16LE(0, to: &central)
            appendUInt16LE(0, to: &central)
            appendUInt16LE(0, to: &central)
            appendUInt16LE(0, to: &central)
            appendUInt32LE(0, to: &central)
            appendUInt32LE(offset, to: &central)
            central.append(name)
        }

        let centralOffset = UInt32(archive.count)
        archive.append(central)
        appendUInt32LE(0x06054b50, to: &archive)
        appendUInt16LE(0, to: &archive)
        appendUInt16LE(0, to: &archive)
        appendUInt16LE(UInt16(entries.count), to: &archive)
        appendUInt16LE(UInt16(entries.count), to: &archive)
        appendUInt32LE(UInt32(central.count), to: &archive)
        appendUInt32LE(centralOffset, to: &archive)
        appendUInt16LE(0, to: &archive)
        return archive
    }

    private func safeDownloadFileName(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\:\0")
        let cleaned = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: invalid)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        return cleaned.isEmpty ? "download" : String(cleaned.prefix(180))
    }

    private func saveKeychainData(_ data: Data) throws {
        try deleteKeychainData(ignoreMissing: true)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: data
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SSHWorkbenchError.keychainStatus(status)
        }
    }

    private func savePersistedProfileData(_ data: Data) throws {
        do {
            try saveKeychainData(data)
            UserDefaults.standard.removeObject(forKey: simulatorProfileFallbackKey)
        } catch {
            guard shouldUseSimulatorProfileFallback(error) else {
                throw error
            }
            UserDefaults.standard.set(data, forKey: simulatorProfileFallbackKey)
            appendDiagnosticLog("warn", "profile.native.save.simulator_fallback", fields: [
                "bytes": data.count
            ])
        }
    }

    private func loadKeychainData() throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw SSHWorkbenchError.keychainStatus(status)
        }

        return result as? Data
    }

    private func loadPersistedProfileData() throws -> Data? {
        do {
            if let data = try loadKeychainData() {
                return data
            }
        } catch {
            guard shouldUseSimulatorProfileFallback(error) else {
                throw error
            }
            appendDiagnosticLog("warn", "profile.native.load.simulator_fallback", fields: [:])
        }
        return UserDefaults.standard.data(forKey: simulatorProfileFallbackKey)
    }

    private func deleteKeychainData(ignoreMissing: Bool = false) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]

        let status = SecItemDelete(query as CFDictionary)
        if status == errSecItemNotFound && ignoreMissing {
            return
        }

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SSHWorkbenchError.keychainStatus(status)
        }
    }

    private func deletePersistedProfileData() throws {
        do {
            try deleteKeychainData()
        } catch {
            guard shouldUseSimulatorProfileFallback(error) else {
                throw error
            }
            appendDiagnosticLog("warn", "profile.native.clear.simulator_fallback", fields: [:])
        }
        UserDefaults.standard.removeObject(forKey: simulatorProfileFallbackKey)
    }

    private func shouldUseSimulatorProfileFallback(_ error: Error) -> Bool {
        #if targetEnvironment(simulator)
        guard case SSHWorkbenchError.keychainStatus(let status) = error else {
            return false
        }
        return status == errSecMissingEntitlement
        #else
        return false
        #endif
    }

    private func safeErrorMessage(_ error: Error) -> String {
        if let localized = (error as? LocalizedError)?.errorDescription, !localized.isEmpty {
            return localized
        }

        let message = String(describing: error)
        return message.replacingOccurrences(of: "\n", with: " ")
    }
}
