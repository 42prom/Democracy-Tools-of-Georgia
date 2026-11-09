# Mobile release assurance gates

The Android and iOS applications share Flutter UI and business logic, but they
do not share their native trust roots. A passing Android build is evidence for
the shared Dart layer; it is not evidence that Apple App Attest, Keychain,
entitlements, signing, notifications, camera permissions, or NFC work on iOS.

`100%` in this project means that every mandatory gate below has recorded
evidence for the exact release commit and signed artifact. It does not mean
that software is mathematically defect-free.

## Mandatory matrix

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Shared Dart contract | `dart analyze lib test integration_test` and all unit/widget tests pass on pinned Flutter 3.44.0 | Passing locally |
| Android native build | Kotlin/Gradle debug compile succeeds with Play Integrity 1.6.0 | Passing locally |
| Android host integration | Shared cold-start/localization test and fail-closed attestation test pass on API 36 | Passing locally |
| Android release integrity | Play-signed build on a physical supported device returns a payload-bound Standard Play Integrity verdict; altered/unlicensed builds are rejected | Requires Play Console credentials and a physical device |
| iOS simulator parity | Unsigned simulator build and the same shared integration contract pass on pinned Flutter 3.44.0 | Enforced by macOS CI; awaiting a CI run |
| iOS native integrity | App Attest key registration, certificate-chain validation, per-ballot assertion, App ID hash, environment, validation category, bundle version, and monotonic counter checks pass | Implemented and covered by negative-path tests; Apple fixture verification still required |
| iOS physical-device test | Sandbox and production App Attest positive paths pass; replay, wrong challenge, wrong bundle, stale counter, and unsupported-device policy are verified | Requires Apple Developer configuration, macOS, and a physical iPhone |
| Release reproducibility | CI builds the reviewed commit, emits SBOM/provenance, and verifies signed artifact hashes | Pending |

## CI parity rule

`.github/workflows/ci.yml` runs the same
`mobile/integration_test/app_smoke_test.dart` contract on Android API 36 and on
the newest available iPhone Simulator. Platform-specific assertions are added
to the same suite and are skipped only when the target platform cannot provide
that API.

Flutter is pinned to `3.44.0` in both jobs. A floating `stable` version alone is
not acceptable release evidence because Android and iOS jobs could otherwise
run against different framework revisions at different times.

## Local Android evidence (2026-09-03)

- Flutter 3.44.0 / Dart 3.12.0.
- Android 16, API 36, Google APIs/Play Store system image.
- `:app:compileDebugKotlin`: passed.
- Flutter unit/widget suite: 47 of 47 passed.
- Android integration suite: 2 of 2 passed.
- The API 36 emulator was recognized as nonphysical and could not mint
  production integrity evidence without a configured Cloud project number.
- The disposable AVD and temporary build copy were removed after testing.

## Release decision

The mobile release remains blocked until both physical-device integrity gates
pass. Simulator parity is mandatory and valuable, but it cannot replace the
hardware-backed provider checks performed by Google and Apple.

## App Attest implementation boundary

The iOS client persists its App Attest key identifier in a
`ThisDeviceOnly` Keychain item. The first request carries Apple's one-time
attestation object plus a request-bound assertion; later requests carry only
fresh assertions. The backend pins Apple's App Attestation root, validates the
certificate chain and certificate nonce, checks the exact App ID/environment/
bundle build policy, binds the key to a one-way voter subject hash, and advances
the assertion counter atomically.

Before release, the App Attest capability must also be enabled for
`ge.dtfg.mobile` in the Apple Developer portal. A production-signed build on a
physical iPhone must populate the fixture matrix above; Windows and an iOS
simulator cannot produce that hardware-backed evidence.
