/// Biometrics removed.
/// This file is kept temporarily to avoid import breakage if any old code still
/// references BiometricGate. Prefer deleting this file after removing all
/// imports.
///
/// If you still see an import error, search for `BiometricGate` and remove it.
class BiometricGate {
  Future<bool> get isAvailable async => false;
  Future<bool> authenticate({String? reason}) async => true;
}
