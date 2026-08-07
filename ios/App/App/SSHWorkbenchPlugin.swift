import Foundation
import Security
import CryptoKit
import ImageIO
import PhotosUI
import UniformTypeIdentifiers
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

private struct NativeUploadResult: Sendable {
    let path: String
    let name: String
    let remoteName: String
    let mime: String
    let size: Int
    let sha256: String
}

private struct NativeUploadFailure: LocalizedError, @unchecked Sendable {
    let message: String
    let code: String
    let stage: String
    let retryable: Bool
    let underlyingError: Error?

    var errorDescription: String? { message }
}

/// One upload owns one SSH transport. Keeping this state outside the pooled
/// command sessions lets timeout/cancel close the upload without disrupting an
/// interactive terminal or an Agent command using the same server profile.
private final class NativeUploadOperation: @unchecked Sendable {
    let uploadId: String
    let call: CAPPluginCall

    private let lock = NSLock()
    private var client: SSHClient?
    private var workTask: Task<Void, Never>?
    private var deadlineTask: Task<Void, Never>?
    private var cancellationRequested = false
    private var completed = false
    private var currentStage = "connect"

    init(uploadId: String, call: CAPPluginCall) {
        self.uploadId = uploadId
        self.call = call
    }

    func setWorkTask(_ task: Task<Void, Never>) {
        lock.lock()
        workTask = task
        let shouldCancel = cancellationRequested
        lock.unlock()
        if shouldCancel { task.cancel() }
    }

    func setDeadlineTask(_ task: Task<Void, Never>) {
        lock.lock()
        deadlineTask = task
        let shouldCancel = completed || cancellationRequested
        lock.unlock()
        if shouldCancel { task.cancel() }
    }

    func setStage(_ stage: String) {
        lock.lock()
        currentStage = stage
        lock.unlock()
    }

    func stage() -> String {
        lock.lock()
        defer { lock.unlock() }
        return currentStage
    }

    func attachClient(_ client: SSHClient) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !cancellationRequested, !completed else { return false }
        self.client = client
        return true
    }

    func clearClient(_ client: SSHClient) {
        lock.lock()
        if self.client === client {
            self.client = nil
        }
        lock.unlock()
    }

    func checkCancellation() throws {
        lock.lock()
        let cancelled = cancellationRequested
        lock.unlock()
        if cancelled || Task.isCancelled {
            throw CancellationError()
        }
    }

    /// Only the first terminal path (success, failure, timeout, or explicit
    /// cancellation) may settle the Capacitor promise.
    func claimCompletion() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !completed else { return false }
        completed = true
        return true
    }

    func cancelDeadline() {
        lock.lock()
        let task = deadlineTask
        deadlineTask = nil
        lock.unlock()
        task?.cancel()
    }

    /// Marks the operation cancelled synchronously, then returns the transport
    /// so the caller can close it without holding the lock across an await.
    func requestCancellation() -> SSHClient? {
        lock.lock()
        cancellationRequested = true
        let client = self.client
        let workTask = self.workTask
        let deadlineTask = self.deadlineTask
        lock.unlock()
        workTask?.cancel()
        deadlineTask?.cancel()
        return client
    }
}

private final class NativeUploadSessionStore: @unchecked Sendable {
    private let lock = NSLock()
    private var operations: [String: NativeUploadOperation] = [:]

    func begin(uploadId: String, call: CAPPluginCall) -> NativeUploadOperation? {
        lock.lock()
        defer { lock.unlock() }
        guard operations[uploadId] == nil else { return nil }
        let operation = NativeUploadOperation(uploadId: uploadId, call: call)
        operations[uploadId] = operation
        return operation
    }

    func operation(uploadId: String) -> NativeUploadOperation? {
        lock.lock()
        defer { lock.unlock() }
        return operations[uploadId]
    }

    func finish(uploadId: String, operation: NativeUploadOperation) {
        lock.lock()
        if operations[uploadId] === operation {
            operations.removeValue(forKey: uploadId)
        }
        lock.unlock()
    }
}

private struct AgentTlsTrustFailure {
    let code: String
    let message: String
    let expectedPrefix: String
    let actualPrefix: String

    var error: NSError {
        NSError(
            domain: "AIWorkbenchAgentTLS",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

private final class AgentTlsTrustFailureStore: @unchecked Sendable {
    private let lock = NSLock()
    private var value: AgentTlsTrustFailure?

    func record(_ failure: AgentTlsTrustFailure) {
        lock.lock()
        if value == nil { value = failure }
        lock.unlock()
    }

    func snapshot() -> AgentTlsTrustFailure? {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

private func agentTlsFingerprintPrefix(_ value: String) -> String {
    let normalized = value
        .replacingOccurrences(of: "sha256/", with: "", options: [.caseInsensitive])
        .trimmingCharacters(in: .whitespacesAndNewlines)
    return String(normalized.prefix(12))
}

private func resolvePinnedAgentChallenge(
    _ challenge: URLAuthenticationChallenge,
    expectedFingerprint: String,
    failureStore: AgentTlsTrustFailureStore,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
        completionHandler(.performDefaultHandling, nil)
        return
    }
    guard let trust = challenge.protectionSpace.serverTrust,
          let certificate = SecTrustGetCertificateAtIndex(trust, 0) else {
        failureStore.record(AgentTlsTrustFailure(
            code: "AGENT_TLS_TRUST_UNAVAILABLE",
            message: "无法读取 Agent 安全证书，请重新连接后再试。",
            expectedPrefix: agentTlsFingerprintPrefix(expectedFingerprint),
            actualPrefix: ""
        ))
        completionHandler(.cancelAuthenticationChallenge, nil)
        return
    }

    let certificateData = SecCertificateCopyData(certificate) as Data
    let actualFingerprint = Data(SHA256.hash(data: certificateData)).base64EncodedString()
    guard !expectedFingerprint.isEmpty, actualFingerprint == expectedFingerprint else {
        failureStore.record(AgentTlsTrustFailure(
            code: "AGENT_TLS_FINGERPRINT_MISMATCH",
            message: "Agent 安全证书已变化，正在使用的连接信息已失效，请重新连接后再试。",
            expectedPrefix: agentTlsFingerprintPrefix(expectedFingerprint),
            actualPrefix: agentTlsFingerprintPrefix(actualFingerprint)
        ))
        completionHandler(.cancelAuthenticationChallenge, nil)
        return
    }

    // The Agent certificate is self-signed and addressed through a private IP.
    // Exact leaf pinning above establishes identity; anchoring that same leaf
    // lets newer iOS releases complete trust evaluation without hostname/SAN
    // fallback or any global ATS exception.
    let policyStatus = SecTrustSetPolicies(trust, SecPolicyCreateBasicX509())
    let anchorStatus = SecTrustSetAnchorCertificates(trust, [certificate] as CFArray)
    SecTrustSetAnchorCertificatesOnly(trust, true)
    var trustError: CFError?
    guard policyStatus == errSecSuccess,
          anchorStatus == errSecSuccess,
          SecTrustEvaluateWithError(trust, &trustError) else {
        failureStore.record(AgentTlsTrustFailure(
            code: "AGENT_TLS_TRUST_EVALUATION_FAILED",
            message: "Agent 安全证书校验失败，请检查设备时间或重新连接后再试。",
            expectedPrefix: agentTlsFingerprintPrefix(expectedFingerprint),
            actualPrefix: agentTlsFingerprintPrefix(actualFingerprint)
        ))
        completionHandler(.cancelAuthenticationChallenge, nil)
        return
    }
    completionHandler(.useCredential, URLCredential(trust: trust))
}

private final class PinnedAgentSessionDelegate: NSObject, URLSessionDelegate {
    private let expectedFingerprint: String
    private let failureStore = AgentTlsTrustFailureStore()

    var trustFailure: AgentTlsTrustFailure? { failureStore.snapshot() }

    init(expectedFingerprint: String) {
        self.expectedFingerprint = expectedFingerprint
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        resolvePinnedAgentChallenge(
            challenge,
            expectedFingerprint: expectedFingerprint,
            failureStore: failureStore,
            completionHandler: completionHandler
        )
    }
}

private final class PinnedAgentWebSocketDelegate: NSObject, URLSessionDelegate, URLSessionWebSocketDelegate {
    private let expectedFingerprint: String
    private let failureStore = AgentTlsTrustFailureStore()
    private let opened: () -> Void
    private let closed: (Error?) -> Void

    init(expectedFingerprint: String, opened: @escaping () -> Void, closed: @escaping (Error?) -> Void) {
        self.expectedFingerprint = expectedFingerprint
        self.opened = opened
        self.closed = closed
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        resolvePinnedAgentChallenge(
            challenge,
            expectedFingerprint: expectedFingerprint,
            failureStore: failureStore,
            completionHandler: completionHandler
        )
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        guard `protocol` == "aiwb.v1" else {
            webSocketTask.cancel(with: .protocolError, reason: Data("Agent WebSocket 协议不匹配。".utf8))
            return
        }
        opened()
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        closed(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let trustFailure = failureStore.snapshot() {
            closed(trustFailure.error)
        } else if let error {
            closed(error)
        }
    }
}

private final class NativeAgentEventStream {
    let session: URLSession
    let task: URLSessionWebSocketTask
    let delegate: PinnedAgentWebSocketDelegate
    var stopped = false

    init(session: URLSession, task: URLSessionWebSocketTask, delegate: PinnedAgentWebSocketDelegate) {
        self.session = session
        self.task = task
        self.delegate = delegate
    }
}

private final class PinnedAgentUploadDelegate: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    private let expectedFingerprint: String
    private let failureStore = AgentTlsTrustFailureStore()
    private let progress: (Int64, Int64) -> Void
    private let completion: (Data, HTTPURLResponse?, Error?) -> Void
    private var responseData = Data()

    init(
        expectedFingerprint: String,
        progress: @escaping (Int64, Int64) -> Void,
        completion: @escaping (Data, HTTPURLResponse?, Error?) -> Void
    ) {
        self.expectedFingerprint = expectedFingerprint
        self.progress = progress
        self.completion = completion
    }

    var trustFailure: AgentTlsTrustFailure? { failureStore.snapshot() }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        resolvePinnedAgentChallenge(
            challenge,
            expectedFingerprint: expectedFingerprint,
            failureStore: failureStore,
            completionHandler: completionHandler
        )
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseData.append(data)
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        progress(totalBytesSent, totalBytesExpectedToSend)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        completion(responseData, task.response as? HTTPURLResponse, error)
    }
}

private final class AgentUploadSessionStore: @unchecked Sendable {
    private let lock = NSLock()
    private var sessions: [String: (URLSession, URLSessionUploadTask)] = [:]

    func insert(uploadId: String, session: URLSession, task: URLSessionUploadTask) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard sessions[uploadId] == nil else { return false }
        sessions[uploadId] = (session, task)
        return true
    }

    func finish(uploadId: String) {
        lock.lock()
        let entry = sessions.removeValue(forKey: uploadId)
        lock.unlock()
        entry?.0.finishTasksAndInvalidate()
    }

    func cancel(uploadId: String) -> Bool {
        lock.lock()
        let entry = sessions.removeValue(forKey: uploadId)
        lock.unlock()
        guard let entry else { return false }
        entry.1.cancel()
        entry.0.invalidateAndCancel()
        return true
    }
}

private final class NativeAttachmentStore: @unchecked Sendable {
    private let lock = NSLock()
    private var files: [String: URL] = [:]
    private let directory: URL

    init() {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("AIWorkbenchAttachments", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let urls = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) {
            let expiry = Date().addingTimeInterval(-24 * 60 * 60)
            for url in urls {
                let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                if modified < expiry { try? FileManager.default.removeItem(at: url) }
            }
        }
    }

    func importFile(from source: URL, displayName: String) throws -> (String, URL) {
        let cleanName = displayName
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")
        let fileName = cleanName.isEmpty ? "attachment.bin" : String(cleanName.prefix(180))
        let attachmentId = UUID().uuidString.lowercased()
        let target = directory.appendingPathComponent("\(attachmentId)-\(fileName)")
        try FileManager.default.copyItem(at: source, to: target)
        lock.lock()
        files[attachmentId] = target
        lock.unlock()
        return (attachmentId, target)
    }

    func url(for attachmentId: String) -> URL? {
        lock.lock()
        defer { lock.unlock() }
        guard let url = files[attachmentId], FileManager.default.fileExists(atPath: url.path) else {
            files.removeValue(forKey: attachmentId)
            return nil
        }
        return url
    }

    func release(_ attachmentId: String) -> Bool {
        lock.lock()
        let url = files.removeValue(forKey: attachmentId)
        lock.unlock()
        guard let url else { return false }
        try? FileManager.default.removeItem(at: url)
        return true
    }
}

@objc(SSHWorkbenchPlugin)
public class SSHWorkbenchPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, PHPickerViewControllerDelegate {
    public let identifier = "SSHWorkbenchPlugin"
    public let jsName = "SSHWorkbench"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connectSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnectSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runCommand", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "agentRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startAgentEventStream", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendAgentEventStream", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAgentEventStream", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "agentUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAgentUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickAttachments", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseAttachment", returnType: CAPPluginReturnPromise),
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
    private let uploadSessions = NativeUploadSessionStore()
    private let agentUploadSessions = AgentUploadSessionStore()
    private let nativeAttachments = NativeAttachmentStore()
    private var pendingAttachmentPickerCall: CAPPluginCall?
    private var agentEventStreams: [String: NativeAgentEventStream] = [:]
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

    @objc func uploadFile(_ call: CAPPluginCall) {
        let uploadId = (call.getString("uploadId") ?? UUID().uuidString)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let platform = (call.getString("platform") ?? "linux")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let requestedPath = (call.getString("remotePath") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedDirectory = (call.getString("remoteDirectory") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let name = (call.getString("name") ?? "file")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let remoteName = (call.getString("remoteName") ?? nativeRemoteBasename(requestedPath))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let mime = (call.getString("mime") ?? "application/octet-stream")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let expectedSize = max(0, call.getInt("expectedSize", call.getInt("size", 0)))
        let rawBase64 = call.getString("base64") ?? ""
        let startedAt = Date()

        guard !uploadId.isEmpty else {
            rejectUploadCall(
                call,
                failure: NativeUploadFailure(
                    message: "缺少附件上传编号。",
                    code: "SSH_UPLOAD_INVALID",
                    stage: "validate",
                    retryable: false,
                    underlyingError: nil
                ),
                uploadId: ""
            )
            return
        }
        guard !requestedPath.isEmpty, !remoteName.isEmpty else {
            rejectUploadCall(
                call,
                failure: NativeUploadFailure(
                    message: "附件远程路径无效。",
                    code: "SSH_UPLOAD_INVALID",
                    stage: "validate",
                    retryable: false,
                    underlyingError: nil
                ),
                uploadId: uploadId
            )
            return
        }
        guard !rawBase64.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            rejectUploadCall(
                call,
                failure: NativeUploadFailure(
                    message: "附件内容为空。",
                    code: "SSH_UPLOAD_INVALID",
                    stage: "validate",
                    retryable: false,
                    underlyingError: nil
                ),
                uploadId: uploadId
            )
            return
        }
        // The SFTP server for a WSL profile is Windows OpenSSH, while the
        // requested path belongs to the WSL filesystem. Refuse explicitly
        // instead of silently writing to the wrong filesystem or falling back
        // to the known-hanging giant-stdin command path.
        guard !platform.contains("wsl") else {
            rejectUploadCall(
                call,
                failure: NativeUploadFailure(
                    message: "iPhone 暂不支持向 WSL 工作区上传附件；附件仍保留，请改用 Linux、macOS 或原生 Windows 会话。",
                    code: "SSH_UPLOAD_WSL_UNSUPPORTED",
                    stage: "validate",
                    retryable: false,
                    underlyingError: nil
                ),
                uploadId: uploadId
            )
            return
        }

        let config: SSHConnectionConfig
        do {
            config = try SSHConnectionConfig(call: call)
        } catch {
            rejectUploadCall(
                call,
                failure: NativeUploadFailure(
                    message: safeErrorMessage(error),
                    code: "SSH_UPLOAD_INVALID",
                    stage: "validate",
                    retryable: false,
                    underlyingError: error
                ),
                uploadId: uploadId
            )
            return
        }

        guard let operation = uploadSessions.begin(uploadId: uploadId, call: call) else {
            rejectUploadCall(
                call,
                failure: NativeUploadFailure(
                    message: "这个附件正在上传，请勿重复提交。",
                    code: "SSH_UPLOAD_IN_PROGRESS",
                    stage: "validate",
                    retryable: false,
                    underlyingError: nil
                ),
                uploadId: uploadId
            )
            return
        }

        appendDiagnosticLog("info", "ssh.native.upload.start", fields: [
            "uploadId": uploadId,
            "host": config.host,
            "port": config.port,
            "username": config.username,
            "platform": platform,
            "remotePath": requestedPath,
            "expectedSize": expectedSize,
            "timeoutSeconds": config.commandTimeoutSeconds
        ])
        emitUploadProgress(
            uploadId: uploadId,
            state: "connecting",
            stage: "connect",
            bytesSent: 0,
            totalBytes: expectedSize,
            path: requestedPath
        )

        let workTask = Task {
            defer {
                self.uploadSessions.finish(uploadId: uploadId, operation: operation)
            }
            do {
                let data = try self.decodeUploadBase64(rawBase64)
                guard data.count <= 64 * 1024 * 1024 else {
                    throw NativeUploadFailure(
                        message: "附件过大，iPhone 单个附件最多支持 64 MB。",
                        code: "SSH_UPLOAD_TOO_LARGE",
                        stage: "validate",
                        retryable: false,
                        underlyingError: nil
                    )
                }
                if expectedSize > 0, data.count != expectedSize {
                    throw NativeUploadFailure(
                        message: "附件内容不完整：预期 \(expectedSize) bytes，实际解码 \(data.count) bytes。",
                        code: "SSH_UPLOAD_SIZE_MISMATCH",
                        stage: "validate",
                        retryable: false,
                        underlyingError: nil
                    )
                }
                try operation.checkCancellation()

                let result = try await self.performNativeUpload(
                    data: data,
                    config: config,
                    operation: operation,
                    platform: platform,
                    requestedDirectory: requestedDirectory,
                    requestedPath: requestedPath,
                    name: name.isEmpty ? remoteName : name,
                    remoteName: remoteName,
                    mime: mime.isEmpty ? "application/octet-stream" : mime
                )
                guard operation.claimCompletion() else {
                    // Timeout/cancel may win in the narrow interval after the
                    // final stat succeeded but before this worker settles the
                    // promise. The caller has already been told the upload did
                    // not complete, so remove that exact random final path.
                    Task {
                        await self.cleanupNativeUploadArtifacts(
                            config: config,
                            uploadId: uploadId,
                            partPath: nil,
                            finalPath: self.nativeSFTPPath(result.path, platform: platform)
                        )
                    }
                    return
                }
                operation.cancelDeadline()
                self.appendDiagnosticLog("info", "ssh.native.upload.success", fields: [
                    "uploadId": uploadId,
                    "host": config.host,
                    "path": result.path,
                    "size": result.size,
                    "sha256": result.sha256,
                    "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000)
                ])
                self.emitUploadProgress(
                    uploadId: uploadId,
                    state: "complete",
                    stage: "complete",
                    bytesSent: result.size,
                    totalBytes: result.size,
                    path: result.path
                )
                call.resolve([
                    "ok": true,
                    "uploadId": uploadId,
                    "path": result.path,
                    "name": result.name,
                    "remoteName": result.remoteName,
                    "mime": result.mime,
                    "size": result.size,
                    "sha256": result.sha256
                ])
            } catch {
                guard operation.claimCompletion() else { return }
                operation.cancelDeadline()
                let failure = self.nativeUploadFailure(error, stage: operation.stage())
                self.appendDiagnosticLog("error", "ssh.native.upload.failed", fields: [
                    "uploadId": uploadId,
                    "host": config.host,
                    "port": config.port,
                    "username": config.username,
                    "stage": failure.stage,
                    "code": failure.code,
                    "retryable": failure.retryable,
                    "error": failure.message,
                    "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000)
                ])
                self.emitUploadProgress(
                    uploadId: uploadId,
                    state: failure.code == "SSH_UPLOAD_CANCELLED" ? "cancelled" : "failed",
                    stage: failure.stage,
                    bytesSent: 0,
                    totalBytes: expectedSize,
                    path: requestedPath
                )
                self.rejectUploadCall(call, failure: failure, uploadId: uploadId)
            }
        }
        operation.setWorkTask(workTask)

        let timeoutNanoseconds = UInt64(config.commandTimeoutSeconds) * 1_000_000_000
        let deadlineTask = Task {
            do {
                try await Task.sleep(nanoseconds: timeoutNanoseconds)
            } catch {
                return
            }
            guard operation.claimCompletion() else { return }
            let stage = operation.stage()
            let client = operation.requestCancellation()
            let failure = NativeUploadFailure(
                message: "附件上传超时（\(config.commandTimeoutSeconds) 秒），连接已终止，请检查网络后重试。",
                code: "SSH_UPLOAD_TIMEOUT",
                stage: stage,
                retryable: stage == "connect",
                underlyingError: nil
            )
            self.appendDiagnosticLog("error", "ssh.native.upload.timeout", fields: [
                "uploadId": uploadId,
                "host": config.host,
                "stage": stage,
                "timeoutSeconds": config.commandTimeoutSeconds,
                "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000)
            ])
            self.emitUploadProgress(
                uploadId: uploadId,
                state: "timeout",
                stage: stage,
                bytesSent: 0,
                totalBytes: expectedSize,
                path: requestedPath
            )
            // Settle immediately; closing the independent transport is cleanup,
            // not a prerequisite for releasing the WebView promise.
            self.rejectUploadCall(call, failure: failure, uploadId: uploadId)
            if let client { try? await client.close() }
        }
        operation.setDeadlineTask(deadlineTask)
    }

    @objc func cancelUpload(_ call: CAPPluginCall) {
        let uploadId = (call.getString("uploadId") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !uploadId.isEmpty else {
            call.reject("缺少附件上传编号。", "SSH_UPLOAD_INVALID")
            return
        }
        guard let operation = uploadSessions.operation(uploadId: uploadId) else {
            call.resolve(["ok": true, "cancelled": false, "active": false, "uploadId": uploadId])
            return
        }
        guard operation.claimCompletion() else {
            call.resolve(["ok": true, "cancelled": false, "active": false, "uploadId": uploadId])
            return
        }

        let stage = operation.stage()
        let client = operation.requestCancellation()
        let failure = NativeUploadFailure(
            message: "附件上传已取消。",
            code: "SSH_UPLOAD_CANCELLED",
            stage: stage,
            retryable: false,
            underlyingError: nil
        )
        appendDiagnosticLog("warn", "ssh.native.upload.cancelled", fields: [
            "uploadId": uploadId,
            "stage": stage
        ])
        emitUploadProgress(
            uploadId: uploadId,
            state: "cancelled",
            stage: stage,
            bytesSent: 0,
            totalBytes: 0,
            path: ""
        )
        rejectUploadCall(operation.call, failure: failure, uploadId: uploadId)
        call.resolve(["ok": true, "cancelled": true, "active": true, "uploadId": uploadId])
        if let client {
            Task { try? await client.close() }
        }
    }

    private func finishAgentEventStream(streamId: String, error: Error? = nil, notify: Bool = true) {
        guard let stream = agentEventStreams.removeValue(forKey: streamId) else { return }
        stream.stopped = true
        stream.task.cancel(with: .goingAway, reason: nil)
        stream.session.invalidateAndCancel()
        if notify {
            notifyListeners("agentEvent", data: [
                "streamId": streamId,
                "state": error == nil ? "closed" : "error",
                "error": error.map { safeErrorMessage($0) } ?? ""
            ])
        }
    }

    private func receiveAgentEvent(streamId: String, stream: NativeAgentEventStream) {
        stream.task.receive { [weak self, weak stream] result in
            DispatchQueue.main.async {
                guard let self, let stream, self.agentEventStreams[streamId] === stream, !stream.stopped else { return }
                switch result {
                case .failure(let error):
                    self.finishAgentEventStream(streamId: streamId, error: error)
                case .success(let message):
                    let data: Data
                    switch message {
                    case .string(let value): data = Data(value.utf8)
                    case .data(let value): data = value
                    @unknown default:
                        self.receiveAgentEvent(streamId: streamId, stream: stream)
                        return
                    }
                    do {
                        guard let event = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                            throw NSError(domain: "AIWorkbenchAgentEvent", code: 1, userInfo: [NSLocalizedDescriptionKey: "Agent 事件内容无效。"])
                        }
                        self.notifyListeners("agentEvent", data: [
                            "streamId": streamId,
                            "state": "event",
                            "event": event
                        ])
                        self.receiveAgentEvent(streamId: streamId, stream: stream)
                    } catch {
                        self.finishAgentEventStream(streamId: streamId, error: error)
                    }
                }
            }
        }
    }

    @objc func startAgentEventStream(_ call: CAPPluginCall) {
        let streamId = (call.getString("streamId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let endpoint = (call.getString("endpoint") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let accessToken = (call.getString("accessToken") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let expectedFingerprint = (call.getString("tlsFingerprint") ?? "")
            .replacingOccurrences(of: "sha256/", with: "", options: [.caseInsensitive])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !streamId.isEmpty, !accessToken.isEmpty, !expectedFingerprint.isEmpty,
              var components = URLComponents(string: endpoint) else {
            call.reject("Agent 事件流配置不完整。", "AGENT_EVENT_INVALID")
            return
        }
        guard components.scheme?.lowercased() == "https" else {
            call.reject("Agent 事件流必须使用 TLS。", "AGENT_EVENT_TLS_REQUIRED")
            return
        }
        components.scheme = "wss"
        components.path = "/v1/events"
        components.query = nil
        components.fragment = nil
        guard let url = components.url else {
            call.reject("Agent 事件流地址无效。", "AGENT_EVENT_INVALID")
            return
        }

        DispatchQueue.main.async {
            self.finishAgentEventStream(streamId: streamId, notify: false)
            var request = URLRequest(url: url)
            request.timeoutInterval = 15
            request.setValue("aiwb.v1, bearer.\(accessToken)", forHTTPHeaderField: "Sec-WebSocket-Protocol")

            let delegate = PinnedAgentWebSocketDelegate(
                expectedFingerprint: expectedFingerprint,
                opened: { [weak self] in
                    DispatchQueue.main.async {
                        guard let self, self.agentEventStreams[streamId] != nil else { return }
                        self.notifyListeners("agentEvent", data: ["streamId": streamId, "state": "open"])
                    }
                },
                closed: { [weak self] error in
                    DispatchQueue.main.async {
                        self?.finishAgentEventStream(streamId: streamId, error: error)
                    }
                }
            )
            let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
            let task = session.webSocketTask(with: request)
            let stream = NativeAgentEventStream(session: session, task: task, delegate: delegate)
            self.agentEventStreams[streamId] = stream
            task.resume()
            self.receiveAgentEvent(streamId: streamId, stream: stream)
            call.resolve(["ok": true, "streamId": streamId, "state": "connecting"])
        }
    }

    @objc func stopAgentEventStream(_ call: CAPPluginCall) {
        let streamId = (call.getString("streamId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        DispatchQueue.main.async {
            let stopped = self.agentEventStreams[streamId] != nil
            self.finishAgentEventStream(streamId: streamId, notify: false)
            call.resolve(["ok": true, "stopped": stopped])
        }
    }

    @objc func sendAgentEventStream(_ call: CAPPluginCall) {
        let streamId = (call.getString("streamId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let message = call.getObject("message"), JSONSerialization.isValidJSONObject(message) else {
            call.reject("Agent WebSocket 消息无效。", "AGENT_EVENT_MESSAGE_INVALID")
            return
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            guard data.count <= 512 * 1024, let value = String(data: data, encoding: .utf8) else {
                call.reject("Agent WebSocket 消息大小无效。", "AGENT_EVENT_MESSAGE_INVALID")
                return
            }
            DispatchQueue.main.async {
                guard let stream = self.agentEventStreams[streamId], !stream.stopped else {
                    call.reject("Agent WebSocket 当前不可用。", "AGENT_EVENT_NOT_OPEN")
                    return
                }
                stream.task.send(.string(value)) { error in
                    DispatchQueue.main.async {
                        if let error {
                            call.reject(self.safeErrorMessage(error), "AGENT_EVENT_SEND_FAILED", error)
                        } else {
                            call.resolve(["ok": true, "streamId": streamId])
                        }
                    }
                }
            }
        } catch {
            call.reject("Agent WebSocket 消息编码失败。", "AGENT_EVENT_MESSAGE_INVALID", error)
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
                if let trustFailure = delegate.trustFailure {
                    self.appendDiagnosticLog("error", "agent.tls.rejected", fields: [
                        "operation": "request",
                        "code": trustFailure.code,
                        "expectedPrefix": trustFailure.expectedPrefix,
                        "actualPrefix": trustFailure.actualPrefix
                    ])
                    call.reject(trustFailure.message, trustFailure.code, error)
                    return
                }
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

    private func nativeAttachmentMimeType(_ url: URL) -> String {
        guard !url.pathExtension.isEmpty,
              let type = UTType(filenameExtension: url.pathExtension),
              let mime = type.preferredMIMEType else {
            return "application/octet-stream"
        }
        return mime
    }

    private func nativeAttachmentPreview(_ url: URL, mime: String) -> [String: Any] {
        guard mime.hasPrefix("image/"),
              let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return [:] }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 320,
            kCGImageSourceShouldCacheImmediately: false
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.76) else { return [:] }
        return ["previewMime": "image/jpeg", "previewBase64": data.base64EncodedString()]
    }

    @objc func pickAttachments(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingAttachmentPickerCall == nil else {
                call.reject("文件选择器已经打开。", "ATTACHMENT_PICKER_ACTIVE")
                return
            }
            guard let viewController = self.bridge?.viewController else {
                call.reject("无法打开文件选择器。", "ATTACHMENT_PICKER_UNAVAILABLE")
                return
            }
            self.pendingAttachmentPickerCall = call
            let chooser = UIAlertController(title: "添加附件", message: nil, preferredStyle: .actionSheet)
            chooser.addAction(UIAlertAction(title: "照片", style: .default) { _ in
                var configuration = PHPickerConfiguration(photoLibrary: .shared())
                configuration.filter = .any(of: [.images, .videos])
                configuration.selectionLimit = max(1, min(call.getInt("maxCount", 10), 10))
                let picker = PHPickerViewController(configuration: configuration)
                picker.delegate = self
                viewController.present(picker, animated: true)
            })
            chooser.addAction(UIAlertAction(title: "文件", style: .default) { _ in
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
                picker.delegate = self
                picker.allowsMultipleSelection = true
                picker.modalPresentationStyle = .formSheet
                viewController.present(picker, animated: true)
            })
            chooser.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
                self.pendingAttachmentPickerCall = nil
                call.resolve(["attachments": [], "native": true])
            })
            if let popover = chooser.popoverPresentationController {
                popover.sourceView = viewController.view
                popover.sourceRect = CGRect(x: viewController.view.bounds.midX, y: viewController.view.bounds.maxY - 1, width: 1, height: 1)
            }
            viewController.present(chooser, animated: true)
        }
    }

    private func nativeAttachmentItem(
        source: URL,
        displayName: String,
        maxBytes: Int64
    ) throws -> ([String: Any], String) {
        let size = Int64(try agentUploadFileSize(source))
        guard size > 0 else { throw NSError(domain: "AIWorkbench", code: 2, userInfo: [NSLocalizedDescriptionKey: "文件为空，无法发送。"]) }
        guard size <= maxBytes else {
            throw NSError(domain: "AIWorkbench", code: 3, userInfo: [NSLocalizedDescriptionKey: "文件太大，当前单个文件最多支持 \(maxBytes / 1024 / 1024)MB。"])
        }
        let (attachmentId, copiedURL) = try nativeAttachments.importFile(from: source, displayName: displayName)
        let mime = nativeAttachmentMimeType(copiedURL)
        var item: [String: Any] = [
            "id": "native-file-\(attachmentId)",
            "nativeAttachmentId": attachmentId,
            "name": displayName,
            "mime": mime,
            "size": size,
            "isImage": mime.hasPrefix("image/")
        ]
        nativeAttachmentPreview(copiedURL, mime: mime).forEach { item[$0.key] = $0.value }
        return (item, attachmentId)
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard let call = pendingAttachmentPickerCall else { return }
        pendingAttachmentPickerCall = nil
        picker.dismiss(animated: true)
        guard !results.isEmpty else {
            call.resolve(["attachments": [], "native": true])
            return
        }
        let maxBytes = Int64(max(1, min(call.getInt("maxBytes", 20 * 1024 * 1024), 64 * 1024 * 1024)))
        let group = DispatchGroup()
        let resultLock = NSLock()
        var attachments: [(Int, [String: Any], String)] = []
        var firstError: Error?

        for (index, result) in results.enumerated() {
            let provider = result.itemProvider
            let typeIdentifier = provider.registeredTypeIdentifiers.first(where: {
                UTType($0)?.conforms(to: .image) == true || UTType($0)?.conforms(to: .movie) == true
            }) ?? provider.registeredTypeIdentifiers.first ?? UTType.data.identifier
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { source, error in
                defer { group.leave() }
                do {
                    if let error { throw error }
                    guard let source else { throw NSError(domain: "AIWorkbench", code: 5, userInfo: [NSLocalizedDescriptionKey: "无法读取所选照片。"]) }
                    let type = UTType(typeIdentifier)
                    let fallbackExtension = type?.preferredFilenameExtension ?? source.pathExtension
                    var name = provider.suggestedName ?? source.deletingPathExtension().lastPathComponent
                    if URL(fileURLWithPath: name).pathExtension.isEmpty, !fallbackExtension.isEmpty {
                        name += ".\(fallbackExtension)"
                    }
                    let (item, attachmentId) = try self.nativeAttachmentItem(source: source, displayName: name, maxBytes: maxBytes)
                    resultLock.lock()
                    attachments.append((index, item, attachmentId))
                    resultLock.unlock()
                } catch {
                    resultLock.lock()
                    if firstError == nil { firstError = error }
                    resultLock.unlock()
                }
            }
        }
        group.notify(queue: .main) {
            if let error = firstError {
                attachments.forEach { _ = self.nativeAttachments.release($0.2) }
                call.reject(self.safeErrorMessage(error), "ATTACHMENT_PICKER_FAILED", error)
                return
            }
            call.resolve([
                "attachments": attachments.sorted { $0.0 < $1.0 }.map { $0.1 },
                "native": true
            ])
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingAttachmentPickerCall else { return }
        pendingAttachmentPickerCall = nil
        let maxCount = max(1, min(call.getInt("maxCount", 10), 10))
        let maxBytes = Int64(max(1, min(call.getInt("maxBytes", 20 * 1024 * 1024), 64 * 1024 * 1024)))
        var importedIds: [String] = []
        var attachments: [[String: Any]] = []

        do {
            for source in urls.prefix(maxCount) {
                let accessGranted = source.startAccessingSecurityScopedResource()
                defer { if accessGranted { source.stopAccessingSecurityScopedResource() } }
                let values = try source.resourceValues(forKeys: [.fileSizeKey, .nameKey, .isRegularFileKey])
                guard values.isRegularFile == true else { throw NSError(domain: "AIWorkbench", code: 1, userInfo: [NSLocalizedDescriptionKey: "只能选择普通文件。"])}
                let name = values.name ?? source.lastPathComponent
                let (item, attachmentId) = try nativeAttachmentItem(source: source, displayName: name, maxBytes: maxBytes)
                importedIds.append(attachmentId)
                attachments.append(item)
            }
            call.resolve(["attachments": attachments, "native": true])
        } catch {
            importedIds.forEach { _ = nativeAttachments.release($0) }
            call.reject(safeErrorMessage(error), "ATTACHMENT_PICKER_FAILED", error)
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let call = pendingAttachmentPickerCall
        pendingAttachmentPickerCall = nil
        call?.resolve(["attachments": [], "native": true])
    }

    @objc func releaseAttachment(_ call: CAPPluginCall) {
        let attachmentId = (call.getString("nativeAttachmentId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        call.resolve(["ok": true, "released": !attachmentId.isEmpty && nativeAttachments.release(attachmentId)])
    }

    private func agentUploadFileSize(_ url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return (attributes[.size] as? NSNumber)?.intValue ?? 0
    }

    private func agentUploadFileSHA256(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let data = try handle.read(upToCount: 256 * 1024), !data.isEmpty {
            hasher.update(data: data)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func agentUploadHeader(_ value: String) -> String {
        Data(value.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    @objc func agentUpload(_ call: CAPPluginCall) {
        let endpoint = (call.getString("endpoint") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let accessToken = (call.getString("accessToken") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let uploadId = (call.getString("uploadId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let workdir = (call.getString("workdir") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let name = (call.getString("name") ?? "attachment.bin").trimmingCharacters(in: .whitespacesAndNewlines)
        let mime = (call.getString("mime") ?? "application/octet-stream").trimmingCharacters(in: .whitespacesAndNewlines)
        let expectedFingerprint = (call.getString("tlsFingerprint") ?? "")
            .replacingOccurrences(of: "sha256/", with: "", options: [.caseInsensitive])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let nativeAttachmentId = (call.getString("nativeAttachmentId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let baseURL = URL(string: endpoint), !accessToken.isEmpty, !uploadId.isEmpty, !workdir.isEmpty,
              let url = URL(string: call.getString("path") ?? "/v1/files", relativeTo: baseURL)?.absoluteURL else {
            call.reject("Agent 附件上传参数不完整。", "AGENT_UPLOAD_INVALID")
            return
        }
        let nativeFileURL = nativeAttachmentId.isEmpty ? nil : nativeAttachments.url(for: nativeAttachmentId)
        let content = nativeFileURL == nil
            ? Data(base64Encoded: call.getString("base64") ?? "", options: [.ignoreUnknownCharacters])
            : nil
        guard nativeFileURL != nil || content != nil else {
            call.reject("附件临时文件已失效，请重新选择文件。", "AGENT_UPLOAD_ATTACHMENT_EXPIRED")
            return
        }
        let actualSize: Int
        let contentSHA256: String
        do {
            if let nativeFileURL {
                actualSize = try agentUploadFileSize(nativeFileURL)
                contentSHA256 = try agentUploadFileSHA256(nativeFileURL)
            } else if let content {
                actualSize = content.count
                contentSHA256 = SHA256.hash(data: content).map { String(format: "%02x", $0) }.joined()
            } else {
                throw NSError(domain: "AIWorkbench", code: 4, userInfo: [NSLocalizedDescriptionKey: "附件内容不存在。"])
            }
        } catch {
            call.reject("附件读取失败，请重新选择文件。", "AGENT_UPLOAD_ATTACHMENT_READ_FAILED", error)
            return
        }
        let declaredSize = call.getInt("size", actualSize)
        guard declaredSize == actualSize else {
            call.reject("附件读取不完整，请重新选择文件。", "AGENT_UPLOAD_INVALID")
            return
        }
        guard url.scheme == "https", !expectedFingerprint.isEmpty else {
            call.reject("Agent 安全上传必须使用带证书指纹的 HTTPS。", "AGENT_UPLOAD_TLS_REQUIRED")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = TimeInterval(max(1_000, min(call.getInt("timeoutMs", 240_000), 300_000))) / 1000
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        request.setValue(String(actualSize), forHTTPHeaderField: "Content-Length")
        request.setValue(uploadId, forHTTPHeaderField: "X-AIWB-Upload-Id")
        request.setValue(agentUploadHeader(workdir), forHTTPHeaderField: "X-AIWB-Workdir")
        request.setValue(agentUploadHeader(name), forHTTPHeaderField: "X-AIWB-File-Name")
        request.setValue(mime, forHTTPHeaderField: "X-AIWB-File-Mime")
        request.setValue(contentSHA256, forHTTPHeaderField: "X-AIWB-Content-SHA256")

        var session: URLSession?
        var uploadDelegate: PinnedAgentUploadDelegate?
        let delegate = PinnedAgentUploadDelegate(
            expectedFingerprint: expectedFingerprint,
            progress: { [weak self] sent, total in
                self?.notifyListeners("uploadProgress", data: [
                    "uploadId": uploadId,
                    "state": "uploading",
                    "bytesSent": sent,
                    "totalBytes": total,
                    "progress": total > 0 ? Double(sent) / Double(total) : 0
                ])
            },
            completion: { [weak self] data, response, error in
                self?.agentUploadSessions.finish(uploadId: uploadId)
                let trustFailure = uploadDelegate?.trustFailure
                uploadDelegate = nil
                session = nil
                if let error {
                    if let trustFailure {
                        self?.appendDiagnosticLog("error", "agent.tls.rejected", fields: [
                            "operation": "upload",
                            "code": trustFailure.code,
                            "expectedPrefix": trustFailure.expectedPrefix,
                            "actualPrefix": trustFailure.actualPrefix
                        ])
                        call.reject(trustFailure.message, trustFailure.code, error)
                        return
                    }
                    call.reject(self?.safeErrorMessage(error) ?? "附件上传失败。", "AGENT_UPLOAD_FAILED", error)
                    return
                }
                call.resolve([
                    "status": response?.statusCode ?? 0,
                    "body": String(data: data, encoding: .utf8) ?? ""
                ])
            }
        )
        uploadDelegate = delegate
        session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
        let task = nativeFileURL.map { session!.uploadTask(with: request, fromFile: $0) }
            ?? session!.uploadTask(with: request, from: content ?? Data())
        guard agentUploadSessions.insert(uploadId: uploadId, session: session!, task: task) else {
            session?.invalidateAndCancel()
            call.reject("相同编号的附件正在上传。", "AGENT_UPLOAD_DUPLICATE")
            return
        }
        task.resume()
    }

    @objc func cancelAgentUpload(_ call: CAPPluginCall) {
        let uploadId = (call.getString("uploadId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cancelled = !uploadId.isEmpty && agentUploadSessions.cancel(uploadId: uploadId)
        call.resolve(["ok": true, "cancelled": cancelled, "active": cancelled, "uploadId": uploadId])
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

    private func performNativeUpload(
        data: Data,
        config: SSHConnectionConfig,
        operation: NativeUploadOperation,
        platform: String,
        requestedDirectory: String,
        requestedPath: String,
        name: String,
        remoteName: String,
        mime: String
    ) async throws -> NativeUploadResult {
        let sftpPath = nativeSFTPPath(requestedPath, platform: platform)
        let directorySource = requestedDirectory.isEmpty
            ? nativeRemoteDirectory(requestedPath)
            : requestedDirectory
        let sftpDirectory = nativeSFTPPath(directorySource, platform: platform)
        let partPath = "\(sftpPath).\(UUID().uuidString.lowercased()).part"
        let totalBytes = data.count
        let sha256 = SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
        var client: SSHClient?
        var sftp: SFTPClient?
        var partMayExist = false
        var renameAttempted = false

        do {
            operation.setStage("connect")
            try operation.checkCancellation()
            let connectedClient = try await createSSHClient(config: config)
            guard operation.attachClient(connectedClient) else {
                try? await connectedClient.close()
                throw CancellationError()
            }
            client = connectedClient
            try operation.checkCancellation()

            operation.setStage("mkdir")
            emitUploadProgress(
                uploadId: operation.uploadId,
                state: "preparing",
                stage: "mkdir",
                bytesSent: 0,
                totalBytes: totalBytes,
                path: requestedPath
            )
            let openedSFTP = try await connectedClient.openSFTP()
            sftp = openedSFTP
            try await ensureNativeUploadDirectory(sftpDirectory, sftp: openedSFTP)
            try operation.checkCancellation()

            operation.setStage("upload")
            emitUploadProgress(
                uploadId: operation.uploadId,
                state: "uploading",
                stage: "upload",
                bytesSent: 0,
                totalBytes: totalBytes,
                path: requestedPath
            )
            // Mark before sending OPEN: the server may create the UUID-scoped
            // file and then lose its response.
            partMayExist = true
            let file = try await openedSFTP.openFile(
                filePath: partPath,
                flags: [.write, .create, .truncate, .forceCreate]
            )
            do {
                let chunkSize = 256 * 1024
                var offset = 0
                var nextLoggedByte = min(totalBytes, 1024 * 1024)
                while offset < totalBytes {
                    try operation.checkCancellation()
                    let end = min(totalBytes, offset + chunkSize)
                    var buffer = ByteBufferAllocator().buffer(capacity: end - offset)
                    buffer.writeBytes(data[offset..<end])
                    try await file.write(buffer, at: UInt64(offset))
                    offset = end
                    emitUploadProgress(
                        uploadId: operation.uploadId,
                        state: "uploading",
                        stage: "upload",
                        bytesSent: offset,
                        totalBytes: totalBytes,
                        path: requestedPath
                    )
                    if offset >= nextLoggedByte || offset == totalBytes {
                        appendDiagnosticLog("info", "ssh.native.upload.progress", fields: [
                            "uploadId": operation.uploadId,
                            "bytesSent": offset,
                            "totalBytes": totalBytes,
                            "progress": totalBytes > 0 ? Double(offset) / Double(totalBytes) : 1
                        ])
                        nextLoggedByte = min(totalBytes, nextLoggedByte + 1024 * 1024)
                    }
                }
                try await file.close()
            } catch {
                try? await file.close()
                throw error
            }
            try operation.checkCancellation()

            operation.setStage("verify")
            emitUploadProgress(
                uploadId: operation.uploadId,
                state: "verifying",
                stage: "verify",
                bytesSent: totalBytes,
                totalBytes: totalBytes,
                path: requestedPath
            )
            let partAttributes = try await openedSFTP.getAttributes(at: partPath)
            guard partAttributes.size == UInt64(totalBytes) else {
                throw NativeUploadFailure(
                    message: "附件上传不完整：本地 \(totalBytes) bytes，远端临时文件 \(partAttributes.size ?? 0) bytes。",
                    code: "SSH_UPLOAD_SIZE_MISMATCH",
                    stage: "verify",
                    retryable: false,
                    underlyingError: nil
                )
            }
            try operation.checkCancellation()

            operation.setStage("rename")
            emitUploadProgress(
                uploadId: operation.uploadId,
                state: "committing",
                stage: "rename",
                bytesSent: totalBytes,
                totalBytes: totalBytes,
                path: requestedPath
            )
            renameAttempted = true
            try await openedSFTP.rename(at: partPath, to: sftpPath)
            try operation.checkCancellation()

            operation.setStage("verify")
            let finalAttributes = try await openedSFTP.getAttributes(at: sftpPath)
            guard finalAttributes.size == UInt64(totalBytes) else {
                throw NativeUploadFailure(
                    message: "附件提交后校验失败：本地 \(totalBytes) bytes，远端文件 \(finalAttributes.size ?? 0) bytes。",
                    code: "SSH_UPLOAD_SIZE_MISMATCH",
                    stage: "verify",
                    retryable: false,
                    underlyingError: nil
                )
            }

            try? await openedSFTP.close()
            sftp = nil
            operation.clearClient(connectedClient)
            try? await connectedClient.close()
            client = nil
            operation.setStage("complete")
            return NativeUploadResult(
                path: requestedPath,
                name: name,
                remoteName: remoteName,
                mime: mime,
                size: totalBytes,
                sha256: sha256
            )
        } catch {
            // Never expose a partial attachment. A timeout/cancel closes the
            // transport first; on ordinary failures these removes execute over
            // the still-live SFTP channel.
            if let sftp {
                if renameAttempted {
                    try? await sftp.remove(at: sftpPath)
                }
                try? await sftp.remove(at: partPath)
                try? await sftp.close()
            }
            if let client {
                operation.clearClient(client)
                try? await client.close()
            }
            if partMayExist {
                // The server may have committed rename even when its response
                // was lost. Cleanup therefore reconnects once and removes only
                // this upload's UUID-scoped part and random final path. This is
                // cleanup, never an upload retry, and it does not delay promise
                // rejection after timeout/cancel.
                Task {
                    await self.cleanupNativeUploadArtifacts(
                        config: config,
                        uploadId: operation.uploadId,
                        partPath: partPath,
                        finalPath: renameAttempted ? sftpPath : nil
                    )
                }
            }
            throw error
        }
    }

    private func cleanupNativeUploadArtifacts(
        config: SSHConnectionConfig,
        uploadId: String,
        partPath: String?,
        finalPath: String?
    ) async {
        appendDiagnosticLog("info", "ssh.native.upload.cleanup.start", fields: [
            "uploadId": uploadId,
            "hasFinalCandidate": finalPath != nil
        ])
        var cleanupClient: SSHClient?
        var cleanupSFTP: SFTPClient?
        do {
            let client = try await createSSHClient(
                config: config,
                connectTimeoutOverrideSeconds: min(config.connectTimeoutSeconds, 10)
            )
            cleanupClient = client
            let cleanupDeadline = Task {
                do {
                    try await Task.sleep(nanoseconds: 20_000_000_000)
                } catch {
                    return
                }
                try? await client.close()
            }
            defer { cleanupDeadline.cancel() }
            let sftp = try await client.openSFTP()
            cleanupSFTP = sftp
            if let finalPath {
                try? await sftp.remove(at: finalPath)
            }
            if let partPath {
                try? await sftp.remove(at: partPath)
            }
            try? await sftp.close()
            cleanupSFTP = nil
            try? await client.close()
            cleanupClient = nil
            appendDiagnosticLog("info", "ssh.native.upload.cleanup.complete", fields: [
                "uploadId": uploadId
            ])
        } catch {
            try? await cleanupSFTP?.close()
            try? await cleanupClient?.close()
            appendDiagnosticLog("warn", "ssh.native.upload.cleanup.failed", fields: [
                "uploadId": uploadId,
                "error": safeErrorMessage(error)
            ])
        }
    }

    private func decodeUploadBase64(_ rawValue: String) throws -> Data {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload: String
        if let comma = trimmed.firstIndex(of: ","),
           trimmed[..<comma].lowercased().contains(";base64") {
            payload = String(trimmed[trimmed.index(after: comma)...])
        } else {
            payload = trimmed
        }
        let compact = payload.components(separatedBy: .whitespacesAndNewlines).joined()
        guard !compact.isEmpty, let data = Data(base64Encoded: compact) else {
            throw NativeUploadFailure(
                message: "附件内容不是有效的 Base64 数据。",
                code: "SSH_UPLOAD_INVALID_BASE64",
                stage: "validate",
                retryable: false,
                underlyingError: nil
            )
        }
        return data
    }

    private func nativeSFTPPath(_ path: String, platform: String) -> String {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        if platform.contains("windows") {
            return trimmed.replacingOccurrences(of: "\\", with: "/")
        }
        return trimmed
    }

    private func nativeRemoteDirectory(_ path: String) -> String {
        let normalized = path.replacingOccurrences(of: "\\", with: "/")
        guard let slash = normalized.lastIndex(of: "/") else { return "." }
        if slash == normalized.startIndex { return "/" }
        return String(normalized[..<slash])
    }

    private func nativeRemoteBasename(_ path: String) -> String {
        path.replacingOccurrences(of: "\\", with: "/")
            .split(separator: "/")
            .last
            .map(String.init) ?? ""
    }

    private func ensureNativeUploadDirectory(_ path: String, sftp: SFTPClient) async throws {
        let normalized = path.replacingOccurrences(of: "\\", with: "/")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty, normalized != ".", normalized != "/" else { return }

        let isAbsolute = normalized.hasPrefix("/")
        let components = normalized.split(separator: "/").map(String.init)
        guard !components.isEmpty else { return }
        var current = isAbsolute ? "/" : ""

        for component in components {
            if current.isEmpty {
                current = component
            } else if current == "/" {
                current += component
            } else {
                current += "/\(component)"
            }

            do {
                _ = try await sftp.getAttributes(at: current)
            } catch {
                do {
                    try await sftp.createDirectory(atPath: current)
                } catch {
                    // A concurrent upload may have created the same directory
                    // between stat and mkdir. Only suppress mkdir's error after
                    // a fresh stat proves that the path now exists.
                    _ = try await sftp.getAttributes(at: current)
                }
            }
        }
    }

    private func nativeUploadFailure(_ error: Error, stage: String) -> NativeUploadFailure {
        if let failure = error as? NativeUploadFailure {
            return failure
        }
        if error is CancellationError {
            return NativeUploadFailure(
                message: "附件上传已取消。",
                code: "SSH_UPLOAD_CANCELLED",
                stage: stage,
                retryable: false,
                underlyingError: error
            )
        }

        let message = safeErrorMessage(error)
        let lowercased = message.lowercased()
        let authenticationFailure = lowercased.contains("auth")
            || lowercased.contains("password")
            || lowercased.contains("permission denied")
            || lowercased.contains("host_key")
            || lowercased.contains("host key")
        let retryableConnectFailure = stage == "connect"
            && !authenticationFailure
            && (
                lowercased.contains("timed out")
                    || lowercased.contains("timeout")
                    || lowercased.contains("refused")
                    || lowercased.contains("unreachable")
                    || lowercased.contains("no route")
                    || lowercased.contains("network")
                    || lowercased.contains("connection reset")
                    || lowercased.contains("socket is not connected")
                    || lowercased.contains("name or service not known")
            )
        let code: String
        switch stage {
        case "connect": code = "SSH_UPLOAD_CONNECT_FAILED"
        case "mkdir": code = "SSH_UPLOAD_MKDIR_FAILED"
        case "verify": code = "SSH_UPLOAD_VERIFY_FAILED"
        case "rename": code = "SSH_UPLOAD_RENAME_FAILED"
        default: code = "SSH_UPLOAD_FAILED"
        }
        return NativeUploadFailure(
            message: "附件上传失败：\(message)",
            code: code,
            stage: stage,
            retryable: retryableConnectFailure,
            underlyingError: error
        )
    }

    private func rejectUploadCall(
        _ call: CAPPluginCall,
        failure: NativeUploadFailure,
        uploadId: String
    ) {
        call.reject(
            failure.message,
            failure.code,
            failure.underlyingError,
            [
                "uploadId": uploadId,
                "stage": failure.stage,
                "retryable": failure.retryable
            ]
        )
    }

    private func emitUploadProgress(
        uploadId: String,
        state: String,
        stage: String,
        bytesSent: Int,
        totalBytes: Int,
        path: String
    ) {
        let progress = totalBytes > 0
            ? min(1, max(0, Double(bytesSent) / Double(totalBytes)))
            : (state == "complete" ? 1 : 0)
        DispatchQueue.main.async {
            self.notifyListeners("uploadProgress", data: [
                "uploadId": uploadId,
                "state": state,
                "stage": stage,
                "bytesSent": bytesSent,
                "totalBytes": totalBytes,
                "progress": progress,
                "path": path
            ])
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

    private func createSSHClient(
        config: SSHConnectionConfig,
        connectTimeoutOverrideSeconds: Int64? = nil
    ) async throws -> SSHClient {
        var settings = SSHClientSettings(
            host: config.host,
            port: config.port,
            authenticationMethod: {
                .passwordBased(username: config.username, password: config.password)
            },
            hostKeyValidator: .custom(PinnedSSHHostKeyValidator(expectedFingerprint: config.sshHostKeyFingerprint))
        )
        settings.connectTimeout = .seconds(connectTimeoutOverrideSeconds ?? config.connectTimeoutSeconds)
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
