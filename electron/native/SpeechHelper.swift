import AVFoundation
import Foundation
import Speech

private func option(_ name: String, default fallback: String) -> String {
    let args = CommandLine.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else {
        return fallback
    }
    return args[index + 1]
}

private let eventFilePath = option("--event-file", default: "")

private func writeEvent(_ payload: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
       let text = String(data: data, encoding: .utf8) {
        writeEventLineToFile(text)
        print(text)
    } else {
        writeEventLineToFile("{\"ok\":false,\"error\":\"语音结果编码失败。\"}")
        print("{\"ok\":false,\"error\":\"语音结果编码失败。\"}")
    }
    fflush(stdout)
}

private func writeFileEvent(_ payload: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
       let text = String(data: data, encoding: .utf8) {
        writeEventLineToFile(text)
    } else {
        writeEventLineToFile("{\"ok\":false,\"error\":\"语音结果编码失败。\"}")
    }
}

private func writeEventLineToFile(_ text: String) {
    guard !eventFilePath.isEmpty, let data = "\(text)\n".data(using: .utf8) else {
        return
    }

    if !FileManager.default.fileExists(atPath: eventFilePath) {
        FileManager.default.createFile(atPath: eventFilePath, contents: nil)
    }

    guard let fileHandle = try? FileHandle(forWritingTo: URL(fileURLWithPath: eventFilePath)) else {
        return
    }

    do {
        try fileHandle.seekToEnd()
        try fileHandle.write(contentsOf: data)
        try fileHandle.close()
    } catch {
        try? fileHandle.close()
    }
}

private func emit(_ payload: [String: Any]) -> Never {
    writeEvent(payload)
    exit(payload["ok"] as? Bool == true ? 0 : 1)
}

private func normalize(_ value: String) -> String {
    let punctuation = CharacterSet.whitespacesAndNewlines
        .union(.punctuationCharacters)
        .union(.symbols)
    return value
        .lowercased()
        .components(separatedBy: punctuation)
        .joined()
}

private func isQuietSpeechError(_ error: Error) -> Bool {
    let nsError = error as NSError
    if nsError.domain == "kAFAssistantErrorDomain", [1101, 1110].contains(nsError.code) {
        return true
    }
    if nsError.domain == "SFSpeechErrorDomain", [1, 203, 216].contains(nsError.code) {
        return true
    }
    let message = nsError.localizedDescription.lowercased()
    return message.contains("no speech")
        || message.contains("no input")
        || message.contains("cancel")
        || message.contains("aborted")
}

private final class SpeechRunner {
    private let mode: String
    private let locale: String
    private let phrases: [String]
    private let timeoutSeconds: TimeInterval
    private let silenceSeconds: TimeInterval
    private let audioEngine = AVAudioEngine()
    private let finishQueue = DispatchQueue(label: "ai-workbench.speech.finish")

    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var timeoutTimer: Timer?
    private var silenceTimer: Timer?
    private var latestText = ""
    private var lastTextChangeAt: Date?
    private var finished = false

    init(mode: String, locale: String, phrases: [String], timeoutSeconds: TimeInterval, silenceSeconds: TimeInterval) {
        self.mode = mode
        self.locale = locale
        self.phrases = phrases
        self.timeoutSeconds = timeoutSeconds
        self.silenceSeconds = silenceSeconds
    }

    func run() {
        requestPermissions { [weak self] allowed, message in
            guard let self else { return }
            guard allowed else {
                emit(["ok": false, "error": message ?? "没有麦克风或语音识别权限。"])
            }
            self.startRecognition()
        }
        RunLoop.main.run()
    }

    private func requestPermissions(_ completion: @escaping (Bool, String?) -> Void) {
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            guard speechStatus == .authorized else {
                completion(false, "没有语音识别权限。请在系统设置里允许 AI Workbench 使用语音识别。")
                return
            }

            AVCaptureDevice.requestAccess(for: .audio) { microphoneGranted in
                if microphoneGranted {
                    completion(true, nil)
                } else {
                    completion(false, "没有麦克风权限。请在系统设置里允许 AI Workbench 使用麦克风。")
                }
            }
        }
    }

    private func startRecognition() {
        DispatchQueue.main.async {
            guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: self.locale)) else {
                emit(["ok": false, "error": "当前语言不支持语音识别。"])
            }
            guard recognizer.isAvailable else {
                emit(["ok": false, "error": "macOS 语音识别暂不可用，请稍后再试。"])
            }

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = self.mode == "wake" ? .search : .dictation
            self.request = request

            let inputNode = self.audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }

            self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                if let result {
                    self.consume(result)
                }
                if let error {
                    if isQuietSpeechError(error) {
                        self.finish(ok: true)
                    } else {
                        self.finish(ok: false, error: "语音识别失败：\((error as NSError).localizedDescription)")
                    }
                    return
                }
                if result?.isFinal == true, self.mode != "wake" {
                    self.finish(ok: true)
                }
            }

            do {
                self.audioEngine.prepare()
                try self.audioEngine.start()
            } catch {
                self.finish(ok: false, error: "麦克风启动失败：\((error as NSError).localizedDescription)")
                return
            }

            self.timeoutTimer = Timer.scheduledTimer(withTimeInterval: self.timeoutSeconds, repeats: false) { [weak self] _ in
                self?.finish(ok: true)
            }

            self.silenceTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
                self?.checkSilence()
            }
        }
    }

    private func consume(_ result: SFSpeechRecognitionResult) {
        let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty, text != latestText {
            latestText = text
            lastTextChangeAt = Date()
            writeEvent(["ok": true, "event": "partial", "mode": mode, "text": latestText])
        }

        if mode == "wake" {
            let normalizedText = normalize(text)
            if let phrase = phrases.first(where: { normalizedText.contains(normalize($0)) }) {
                finish(ok: true, detected: true, phrase: phrase)
            } else if result.isFinal {
                finish(ok: true, detected: false)
            }
        }
    }

    private func checkSilence() {
        guard mode != "wake", let lastTextChangeAt else { return }
        if Date().timeIntervalSince(lastTextChangeAt) >= silenceSeconds {
            finish(ok: true)
        }
    }

    private func finish(ok: Bool, detected: Bool? = nil, phrase: String = "", error: String? = nil) {
        finishQueue.async {
            if self.finished { return }
            self.finished = true

            DispatchQueue.main.async {
                self.timeoutTimer?.invalidate()
                self.silenceTimer?.invalidate()
                self.timeoutTimer = nil
                self.silenceTimer = nil

                self.request?.endAudio()
                self.request = nil
                self.task?.cancel()
                self.task = nil

                self.audioEngine.inputNode.removeTap(onBus: 0)
                if self.audioEngine.isRunning {
                    self.audioEngine.stop()
                }

                if ok {
                    var payload: [String: Any] = ["ok": true, "text": self.latestText]
                    if self.mode == "wake" {
                        payload["detected"] = detected ?? false
                        payload["phrase"] = phrase
                    }
                    emit(payload)
                } else {
                    emit(["ok": false, "error": error ?? "语音识别失败。"])
                }
            }
        }
    }
}

private final class PcmRecorder {
    private let targetSampleRate: Double = 16000
    private let voiceThreshold: Float = 0.006
    private let timeoutSeconds: TimeInterval
    private let silenceSeconds: TimeInterval
    private let audioEngine = AVAudioEngine()
    private let finishQueue = DispatchQueue(label: "ai-workbench.pcm.finish")

    private var timeoutTimer: Timer?
    private var silenceTimer: Timer?
    private var lastVoiceAt: Date?
    private var lastLevelEventAt = Date.distantPast
    private var resamplePosition: Double = 0
    private var startedAt = Date()
    private var finished = false
    private var sampleRate: Double = 16000

    init(timeoutSeconds: TimeInterval, silenceSeconds: TimeInterval) {
        self.timeoutSeconds = timeoutSeconds
        self.silenceSeconds = silenceSeconds
    }

    func run() {
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            guard let self else { return }
            guard granted else {
                emit(["ok": false, "error": "没有麦克风权限。请在系统设置里允许 AI Workbench 使用麦克风。"])
            }
            self.startRecording()
        }
        RunLoop.main.run()
    }

    private func startRecording() {
        DispatchQueue.main.async {
            let inputNode = self.audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else {
                emit(["ok": false, "error": "当前设备暂时不能使用麦克风。"])
            }

            self.sampleRate = self.targetSampleRate
            self.startedAt = Date()
            self.lastVoiceAt = nil
            self.lastLevelEventAt = Date.distantPast
            self.resamplePosition = 0
            writeEvent([
                "ok": true,
                "event": "audio-start",
                "sampleRate": Int(self.targetSampleRate),
                "inputSampleRate": Int(format.sampleRate),
                "channels": Int(format.channelCount)
            ])

            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
                self?.consume(buffer)
            }

            do {
                self.audioEngine.prepare()
                try self.audioEngine.start()
            } catch {
                self.finish(ok: false, error: "麦克风启动失败：\((error as NSError).localizedDescription)")
                return
            }

            self.timeoutTimer = Timer.scheduledTimer(withTimeInterval: self.timeoutSeconds, repeats: false) { [weak self] _ in
                self?.finish(ok: true)
            }

            self.silenceTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
                self?.checkSilence()
            }
        }
    }

    private func consume(_ buffer: AVAudioPCMBuffer) {
        guard !finished, let channelData = buffer.floatChannelData else {
            return
        }

        let rendered = renderPcm16k(from: buffer, channelData: channelData)
        emitLevelIfNeeded(rms: rendered.rms, peak: rendered.peak)

        if rendered.rms > voiceThreshold {
            lastVoiceAt = Date()
        }

        if !rendered.data.isEmpty {
            writeFileEvent([
                "ok": true,
                "event": "audio",
                "data": rendered.data.base64EncodedString()
            ])
        }
    }

    private func renderPcm16k(from buffer: AVAudioPCMBuffer, channelData: UnsafePointer<UnsafeMutablePointer<Float>>) -> (data: Data, rms: Float, peak: Float) {
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else {
            return (Data(), 0, 0)
        }

        let channelCount = max(1, Int(buffer.format.channelCount))
        let inputSampleRate = max(1, buffer.format.sampleRate)
        let ratio = inputSampleRate / targetSampleRate
        var sourcePosition = resamplePosition
        var pcm = Data(capacity: max(1, Int(Double(frameLength) / ratio) * 2))
        var sumSquares: Double = 0
        var peak: Float = 0
        var outputCount = 0

        while sourcePosition < Double(frameLength) {
            let frame = min(frameLength - 1, Int(sourcePosition))
            let nextFrame = min(frameLength - 1, frame + 1)
            let fraction = Float(sourcePosition - Double(frame))
            var current: Float = 0
            var next: Float = 0
            for channel in 0..<channelCount {
                current += channelData[channel][frame]
                next += channelData[channel][nextFrame]
            }
            current /= Float(channelCount)
            next /= Float(channelCount)
            let sample = current + (next - current) * fraction
            sumSquares += Double(sample * sample)
            peak = max(peak, abs(sample))
            let clamped = max(-1, min(1, sample))
            let intSample = Int16(clamped * Float(Int16.max))
            var littleEndian = intSample.littleEndian
            withUnsafeBytes(of: &littleEndian) { bytes in
                pcm.append(contentsOf: bytes)
            }
            outputCount += 1
            sourcePosition += ratio
        }

        resamplePosition = sourcePosition - Double(frameLength)
        if resamplePosition < 0 || resamplePosition > ratio {
            resamplePosition = 0
        }

        let rms = Float(sqrt(sumSquares / Double(max(1, outputCount))))
        return (pcm, rms, peak)
    }

    private func emitLevelIfNeeded(rms: Float, peak: Float) {
        let now = Date()
        guard now.timeIntervalSince(lastLevelEventAt) >= 0.15 else {
            return
        }

        lastLevelEventAt = now
        let normalized = min(1, max(0, Double(rms) / 0.08))
        writeEvent([
            "ok": true,
            "event": "level",
            "level": normalized,
            "rms": Double(rms),
            "peak": Double(peak),
            "voice": rms > voiceThreshold
        ])
    }

    private func checkSilence() {
        guard !finished else { return }

        if let lastVoiceAt {
            if Date().timeIntervalSince(lastVoiceAt) >= silenceSeconds {
                finish(ok: true)
            }
            return
        }

        if Date().timeIntervalSince(startedAt) >= min(timeoutSeconds, 8) {
            finish(ok: true)
        }
    }

    private func finish(ok: Bool, error: String? = nil) {
        finishQueue.async {
            if self.finished { return }
            self.finished = true

            DispatchQueue.main.async {
                self.timeoutTimer?.invalidate()
                self.silenceTimer?.invalidate()
                self.timeoutTimer = nil
                self.silenceTimer = nil

                self.audioEngine.inputNode.removeTap(onBus: 0)
                if self.audioEngine.isRunning {
                    self.audioEngine.stop()
                }

                if ok {
                    emit([
                        "ok": true,
                        "event": "audio-end",
                        "sampleRate": Int(self.sampleRate)
                    ])
                } else {
                    emit(["ok": false, "error": error ?? "录音失败。"])
                }
            }
        }
    }
}

let command = CommandLine.arguments.dropFirst().first ?? "listen"
let locale = option("--locale", default: "zh-CN")
let timeout = TimeInterval(Double(option("--timeout", default: command == "wake" ? "50" : "12")) ?? 12)
let silence = TimeInterval(Double(option("--silence", default: "1.2")) ?? 1.2)
let phrasesRaw = option("--phrases", default: "未来")
let phrases = phrasesRaw
    .split(separator: "|")
    .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }

if command == "pcm" {
    let recorder = PcmRecorder(
        timeoutSeconds: max(2, timeout),
        silenceSeconds: max(0.8, silence)
    )
    recorder.run()
} else {
    let runner = SpeechRunner(
        mode: command == "wake" ? "wake" : "listen",
        locale: locale,
        phrases: phrases,
        timeoutSeconds: max(2, timeout),
        silenceSeconds: max(0.6, silence)
    )
    runner.run()
}
