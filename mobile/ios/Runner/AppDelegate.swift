import CryptoKit
import DeviceCheck
import Flutter
import Security
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  private let attestationChannel = "messaging.dtg/device_attestation"
  private let keychainService = "ge.dtfg.mobile.app-attest"
  private let keyIdAccount = "key-id-v1"
  private let pendingAttestationAccount = "pending-attestation-v1"

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    guard let controller = window?.rootViewController as? FlutterViewController else {
      return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    FlutterMethodChannel(
      name: attestationChannel,
      binaryMessenger: controller.binaryMessenger
    ).setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(FlutterError(code: "APP_ATTEST_UNAVAILABLE", message: "App delegate unavailable.", details: nil))
        return
      }
      switch call.method {
      case "appAttestEvidence":
        guard #available(iOS 14.0, *) else {
          result(FlutterError(code: "APP_ATTEST_UNSUPPORTED", message: "App Attest requires iOS 14 or newer.", details: nil))
          return
        }
        guard
          let arguments = call.arguments as? [String: Any],
          let binding = arguments["nonce"] as? String,
          !binding.isEmpty
        else {
          result(FlutterError(code: "INVALID_APP_ATTEST_BINDING", message: "A request binding is required.", details: nil))
          return
        }
        self.generateAppAttestEvidence(binding: binding, result: result)
      case "confirmAppAttestRegistration":
        self.deleteKeychainValue(account: self.pendingAttestationAccount)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  @available(iOS 14.0, *)
  private func generateAppAttestEvidence(binding: String, result: @escaping FlutterResult) {
    let service = DCAppAttestService.shared
    guard service.isSupported else {
      result(FlutterError(code: "APP_ATTEST_UNSUPPORTED", message: "App Attest is not supported on this device.", details: nil))
      return
    }
    let clientDataHash = Data(SHA256.hash(data: Data(binding.utf8)))

    if let keyIdData = loadKeychainValue(account: keyIdAccount),
       let keyId = String(data: keyIdData, encoding: .utf8) {
      let pending = loadKeychainValue(account: pendingAttestationAccount)
      generateAssertion(
        service: service,
        keyId: keyId,
        clientDataHash: clientDataHash,
        attestationObject: pending,
        result: result
      )
      return
    }

    service.generateKey { [weak self] keyId, error in
      guard let self = self else { return }
      guard error == nil, let keyId = keyId else {
        self.returnAppAttestError(code: "APP_ATTEST_KEY_FAILED", error: error, result: result)
        return
      }
      do {
        try self.saveKeychainValue(Data(keyId.utf8), account: self.keyIdAccount)
      } catch {
        self.returnAppAttestError(code: "APP_ATTEST_KEY_STORAGE_FAILED", error: error, result: result)
        return
      }

      service.attestKey(keyId, clientDataHash: clientDataHash) { [weak self] attestation, error in
        guard let self = self else { return }
        guard error == nil, let attestation = attestation else {
          self.deleteKeychainValue(account: self.keyIdAccount)
          self.returnAppAttestError(code: "APP_ATTEST_ATTESTATION_FAILED", error: error, result: result)
          return
        }
        do {
          // Retain only until the backend confirms a request containing it.
          // Apple recommends persisting the key identifier, not the attestation.
          try self.saveKeychainValue(attestation, account: self.pendingAttestationAccount)
        } catch {
          self.deleteKeychainValue(account: self.keyIdAccount)
          self.returnAppAttestError(code: "APP_ATTEST_STORAGE_FAILED", error: error, result: result)
          return
        }
        self.generateAssertion(
          service: service,
          keyId: keyId,
          clientDataHash: clientDataHash,
          attestationObject: attestation,
          result: result
        )
      }
    }
  }

  @available(iOS 14.0, *)
  private func generateAssertion(
    service: DCAppAttestService,
    keyId: String,
    clientDataHash: Data,
    attestationObject: Data?,
    result: @escaping FlutterResult
  ) {
    service.generateAssertion(keyId, clientDataHash: clientDataHash) { [weak self] assertion, error in
      guard let self = self else { return }
      guard error == nil, let assertion = assertion else {
        self.returnAppAttestError(code: "APP_ATTEST_ASSERTION_FAILED", error: error, result: result)
        return
      }
      var evidence: [String: Any] = [
        "version": 1,
        "keyId": keyId,
        "assertion": assertion.base64EncodedString(),
      ]
      if let attestationObject = attestationObject {
        evidence["attestationObject"] = attestationObject.base64EncodedString()
      }
      do {
        let encoded = try JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys])
        guard let json = String(data: encoded, encoding: .utf8) else {
          throw NSError(domain: "AppAttest", code: 1)
        }
        DispatchQueue.main.async { result(json) }
      } catch {
        self.returnAppAttestError(code: "APP_ATTEST_ENCODING_FAILED", error: error, result: result)
      }
    }
  }

  private func returnAppAttestError(code: String, error: Error?, result: @escaping FlutterResult) {
    DispatchQueue.main.async {
      result(FlutterError(
        code: code,
        message: error.map { String(describing: type(of: $0)) } ?? "App Attest operation failed.",
        details: nil
      ))
    }
  }

  private func loadKeychainValue(account: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
    return item as? Data
  }

  private func saveKeychainValue(_ value: Data, account: String) throws {
    deleteKeychainValue(account: account)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: account,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      kSecValueData as String: value,
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    if status != errSecSuccess {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
  }

  private func deleteKeychainValue(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
