import Foundation
import Security
import Capacitor
import Citadel

private struct SSHConnectionConfig {
    let host: String
    let port: Int
    let username: String
    let password: String
    let connectTimeoutSeconds: Int64

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

        self.host = host
        self.username = username
        self.password = password
        self.port = max(1, call.getInt("port", 22))
        self.connectTimeoutSeconds = Int64(max(3, min(call.getInt("connectTimeoutSeconds", 15), 60)))
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

@objc(SSHWorkbenchPlugin)
public class SSHWorkbenchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SSHWorkbenchPlugin"
    public let jsName = "SSHWorkbench"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "runCommand", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveProfile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadProfile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearProfile", returnType: CAPPluginReturnPromise)
    ]

    private let keychainService = "com.beexofficial.aiworkbench.connection"
    private let keychainAccount = "default-profile"

    @objc func runCommand(_ call: CAPPluginCall) {
        let startedAt = Date()

        do {
            let config = try SSHConnectionConfig(call: call)
            guard let command = call.getString("command")?.trimmingCharacters(in: .whitespacesAndNewlines), !command.isEmpty else {
                throw SSHWorkbenchError.missingField("command")
            }
            let maxResponseSize = max(1024, min(call.getInt("maxResponseSize", 1_048_576), 8_388_608))

            Task {
                do {
                    let output = try await self.execute(command: command, config: config, maxResponseSize: maxResponseSize)
                    call.resolve([
                        "ok": true,
                        "stdout": output,
                        "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000)
                    ])
                } catch {
                    call.reject("SSH command failed: \(self.safeErrorMessage(error))", "SSH_COMMAND_FAILED", error)
                }
            }
        } catch {
            call.reject(safeErrorMessage(error), "SSH_CONFIG_INVALID", error)
        }
    }

    @objc func saveProfile(_ call: CAPPluginCall) {
        do {
            let profile = call.getObject("profile", [:])
            let data = try JSONSerialization.data(withJSONObject: profile, options: [])
            try saveKeychainData(data)
            call.resolve(["ok": true])
        } catch {
            call.reject("Could not save connection profile: \(safeErrorMessage(error))", "KEYCHAIN_SAVE_FAILED", error)
        }
    }

    @objc func loadProfile(_ call: CAPPluginCall) {
        do {
            guard let data = try loadKeychainData() else {
                call.resolve(["profile": [:]])
                return
            }

            let object = try JSONSerialization.jsonObject(with: data, options: [])
            let profile = object as? JSObject ?? [:]
            call.resolve(["profile": profile])
        } catch {
            call.reject("Could not load connection profile: \(safeErrorMessage(error))", "KEYCHAIN_LOAD_FAILED", error)
        }
    }

    @objc func clearProfile(_ call: CAPPluginCall) {
        do {
            try deleteKeychainData()
            call.resolve(["ok": true])
        } catch {
            call.reject("Could not clear connection profile: \(safeErrorMessage(error))", "KEYCHAIN_CLEAR_FAILED", error)
        }
    }

    private func execute(command: String, config: SSHConnectionConfig, maxResponseSize: Int) async throws -> String {
        var settings = SSHClientSettings(
            host: config.host,
            port: config.port,
            authenticationMethod: {
                .passwordBased(username: config.username, password: config.password)
            },
            hostKeyValidator: .acceptAnything()
        )
        settings.connectTimeout = .seconds(config.connectTimeoutSeconds)

        let client = try await SSHClient.connect(to: settings)
        do {
            var output = try await client.executeCommand(
                command,
                maxResponseSize: maxResponseSize,
                mergeStreams: true,
                inShell: false
            )
            let text = output.readString(length: output.readableBytes) ?? ""
            try? await client.close()
            return text
        } catch {
            try? await client.close()
            throw error
        }
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

    private func safeErrorMessage(_ error: Error) -> String {
        if let localized = (error as? LocalizedError)?.errorDescription, !localized.isEmpty {
            return localized
        }

        let message = String(describing: error)
        return message.replacingOccurrences(of: "\n", with: " ")
    }
}
