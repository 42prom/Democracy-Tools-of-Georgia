import { useState, useEffect } from 'react';
import { Save, X, CheckCircle, XCircle, Loader, Eye, EyeOff } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

// Provider options
const NFC_PROVIDERS = [
  { value: 'mock', label: 'Mock (MVP)' },
  { value: 'on_device_georgia', label: 'On-device NFC Scan (Georgia)' },
];

const DOCUMENT_SCANNER_PROVIDERS = [
  { value: 'manual', label: 'Manual Entry (MVP)' },
  { value: 'on_device_ocr_mrz', label: 'On-device Document Scan + OCR/MRZ' },
];

const LIVENESS_PROVIDERS = [
  { value: 'mock', label: 'Mock (MVP)' },
  { value: 'provider', label: 'Provider (future)' },
  { value: 'in_house', label: 'In-house (optional)' },
];

const FACE_MATCH_PROVIDERS = [
  { value: 'mock', label: 'Mock (MVP)' },
  { value: 'provider', label: 'Provider (future)' },
  { value: 'in_house', label: 'In-house (NEW)' },
];

interface VerificationConfig {
  nfc: {
    provider: string;
    requireNfc: boolean;
    requireGeorgianCitizen: boolean;
    requirePersonalNumber: boolean;
  };
  documentScanner: {
    provider: string;
    apiKey: string;
    requireDocumentPhotoScan: boolean;
    strictness: 'strict' | 'lenient';
  };
  liveness: {
    provider: string;
    apiKey: string;
    minScore: number;
    retryLimit: number;
  };
  faceMatch: {
    provider: string;
    apiKey: string;
    minScore: number;
  };
}

interface TestStatus {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
}

export default function SettingsVerificationProviders() {
  const [config, setConfig] = useState<VerificationConfig>({
    nfc: {
      provider: 'mock',
      requireNfc: true,
      requireGeorgianCitizen: true,
      requirePersonalNumber: true,
    },
    documentScanner: {
      provider: 'manual',
      apiKey: '',
      requireDocumentPhotoScan: true,
      strictness: 'strict',
    },
    liveness: { provider: 'mock', apiKey: '', minScore: 0.7, retryLimit: 3 },
    faceMatch: { provider: 'mock', apiKey: '', minScore: 0.75 },
  });

  const [originalConfig, setOriginalConfig] = useState<VerificationConfig>(config);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Test statuses
  const [documentTestStatus, setDocumentTestStatus] = useState<TestStatus>({ status: 'idle' });
  const [livenessTestStatus, setLivenessTestStatus] = useState<TestStatus>({ status: 'idle' });
  const [faceMatchTestStatus, setFaceMatchTestStatus] = useState<TestStatus>({ status: 'idle' });

  // Show/hide API keys
  const [showDocumentKey, setShowDocumentKey] = useState(false);
  const [showLivenessKey, setShowLivenessKey] = useState(false);
  const [showFaceMatchKey, setShowFaceMatchKey] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    setHasChanges(JSON.stringify(config) !== JSON.stringify(originalConfig));
  }, [config, originalConfig]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/admin/settings', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setOriginalConfig(data);
      } else {
        const err = await response.json().catch(() => ({}));
        setBanner({ type: 'error', message: err?.error?.message || 'Failed to load settings' });
      }
    } catch (error) {
      console.error('Failed to load verification providers config:', error);
      setBanner({ type: 'error', message: 'Failed to load settings (network error)' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/v1/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setOriginalConfig(data);
        setBanner({ type: 'success', message: 'Settings saved successfully' });
      } else {
        const err = await response.json().catch(() => ({}));
        setBanner({ type: 'error', message: err?.error?.message || 'Failed to save settings' });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setBanner({ type: 'error', message: 'Failed to save settings (network error)' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setConfig(originalConfig);
  };

  const testConnection = async (
    provider: 'documentScanner' | 'liveness' | 'faceMatch',
    setStatus: React.Dispatch<React.SetStateAction<TestStatus>>
  ) => {
    // On-device providers run on the phone; connection testing is not applicable.
    if (String(config[provider].provider).startsWith('on_device')) {
      setStatus({ status: 'error', message: 'Test connection is disabled for on-device providers' });
      return;
    }

    setStatus({ status: 'testing', message: 'Testing connection...' });

    try {
      const response = await fetch('/api/v1/admin/settings/verification-providers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: config[provider].provider,
          apiKey: config[provider].apiKey,
          type: provider,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus({
          status: 'success',
          message: data.message || 'Connection successful!',
        });
      } else {
        setStatus({
          status: 'error',
          message: data.error || 'Connection failed',
        });
      }
    } catch (error) {
      setStatus({
        status: 'error',
        message: 'Connection test failed',
      });
    }
  };

  const getStatusIcon = (status: TestStatus) => {
    switch (status.status) {
      case 'testing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`border-l-4 p-4 rounded-lg ${
            banner.type === 'success'
              ? 'bg-green-50 border-green-400 text-green-800'
              : 'bg-red-50 border-red-400 text-red-800'
          }`}
        >
          <p className="text-sm">{banner.message}</p>
        </div>
      )}

      {/* Warning Banner for Mock Providers */}
      {(config.nfc.provider === 'mock' ||
        config.documentScanner.provider === 'manual' ||
        config.liveness.provider === 'mock' ||
        config.faceMatch.provider === 'mock') && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong className="font-medium">Development Mode Active:</strong> You are using mock/manual providers that bypass actual verification.
                {' '}<strong>Do not use in production!</strong> Mock providers accept all verification attempts without proper security checks.
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                For production use, configure real verification providers (NFC, FaceTec, AWS Rekognition, etc.) with proper API keys.
              </p>
            </div>
          </div>
        </div>
      )}


      {/* NFC Verification Card */}
      <Card>
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">NFC Verification</h2>
            <p className="text-sm text-gray-600 mt-1">
              Reads chip data from Georgian ID/Passport using on-device NFC. Backend validates policy and starts enrollment.
            </p>
          </div>

          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
              <select
                value={config.nfc.provider}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    nfc: { ...config.nfc, provider: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {NFC_PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Policy toggles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.nfc.requireNfc}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      nfc: { ...config.nfc, requireNfc: e.target.checked },
                    })
                  }
                />
                Require NFC
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.nfc.requireGeorgianCitizen}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      nfc: { ...config.nfc, requireGeorgianCitizen: e.target.checked },
                    })
                  }
                />
                Require Georgian citizen
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.nfc.requirePersonalNumber}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      nfc: { ...config.nfc, requirePersonalNumber: e.target.checked },
                    })
                  }
                />
                Require personal number
              </label>
            </div>

            {/* Test connection (disabled for on-device providers) */}
            <div className="flex items-center gap-4">
              <Button variant="outline" disabled>
                Test Connection
              </Button>
              <span className="text-xs text-gray-500">
                Test connection is disabled for on-device NFC providers.
              </span>
            </div>
          </div>
        </div>
      </Card>


      {/* Document Scanner Card */}
      <Card>
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Document Scanner</h2>
            <p className="text-sm text-gray-600 mt-1">
              Reads and validates government-issued identity documents (passport, ID card) to extract user credentials.
            </p>
          </div>

          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provider
              </label>
              <select
                value={config.documentScanner.provider}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    documentScanner: { ...config.documentScanner, provider: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {DOCUMENT_SCANNER_PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>


            {/* Policy */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.documentScanner.requireDocumentPhotoScan}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      documentScanner: { ...config.documentScanner, requireDocumentPhotoScan: e.target.checked },
                    })
                  }
                />
                Require document photo scan
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Field comparison strictness</label>
                <select
                  value={config.documentScanner.strictness}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      documentScanner: { ...config.documentScanner, strictness: e.target.value as any },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="strict">Strict</option>
                  <option value="lenient">Lenient</option>
                </select>
              </div>
            </div>

            {/* API Key */}
            {config.documentScanner.provider !== 'manual' && !config.documentScanner.provider.startsWith('on_device') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      type={showDocumentKey ? 'text' : 'password'}
                      value={config.documentScanner.apiKey}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          documentScanner: {
                            ...config.documentScanner,
                            apiKey: e.target.value,
                          },
                        })
                      }
                      placeholder="Enter API key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDocumentKey(!showDocumentKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showDocumentKey ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Test Connection */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => testConnection('documentScanner', setDocumentTestStatus)}
                disabled={
                  documentTestStatus.status === 'testing' ||
                  (config.documentScanner.provider !== 'manual' &&
                    !config.documentScanner.provider.startsWith('on_device') &&
                    !config.documentScanner.apiKey)
                }
              >
                Test Connection
              </Button>

              {getStatusIcon(documentTestStatus)}

              {documentTestStatus.message && (
                <span
                  className={`text-sm ${
                    documentTestStatus.status === 'success'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {documentTestStatus.message}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Liveness Card */}
      <Card>
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Liveness Verification</h2>
            <p className="text-sm text-gray-600 mt-1">
              Confirms the user is a real person present during authentication using active liveness detection (head movement, blinking, etc.).
            </p>
          </div>

          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provider
              </label>
              <select
                value={config.liveness.provider}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    liveness: { ...config.liveness, provider: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {LIVENESS_PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key */}
            {config.liveness.provider === 'provider' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      type={showLivenessKey ? 'text' : 'password'}
                      value={config.liveness.apiKey}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          liveness: { ...config.liveness, apiKey: e.target.value },
                        })
                      }
                      placeholder="Enter API key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLivenessKey(!showLivenessKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showLivenessKey ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Min Score Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Score Threshold
              </label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={config.liveness.minScore}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    liveness: {
                      ...config.liveness,
                      minScore: parseFloat(e.target.value),
                    },
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Score range: 0.0 to 1.0 (current: {config.liveness.minScore})
              </p>
            </div>

            {/* Retry Limit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Retry Limit
              </label>
              <Input
                type="number"
                min="1"
                max="10"
                value={config.liveness.retryLimit}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    liveness: {
                      ...config.liveness,
                      retryLimit: parseInt(e.target.value),
                    },
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum number of retry attempts
              </p>
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => testConnection('liveness', setLivenessTestStatus)}
                disabled={
                  livenessTestStatus.status === 'testing' ||
                  (config.liveness.provider !== 'mock' && !config.liveness.apiKey)
                }
              >
                Test Connection
              </Button>

              {getStatusIcon(livenessTestStatus)}

              {livenessTestStatus.message && (
                <span
                  className={`text-sm ${
                    livenessTestStatus.status === 'success'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {livenessTestStatus.message}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Face Match Card */}
      <Card>
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Face Matching</h2>
            <p className="text-sm text-gray-600 mt-1">
              Compares the live selfie captured during authentication with the photo from the scanned document to verify identity.
            </p>
          </div>

          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provider
              </label>
              <select
                value={config.faceMatch.provider}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    faceMatch: { ...config.faceMatch, provider: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {FACE_MATCH_PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key */}
            {config.faceMatch.provider === 'provider' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      type={showFaceMatchKey ? 'text' : 'password'}
                      value={config.faceMatch.apiKey}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          faceMatch: { ...config.faceMatch, apiKey: e.target.value },
                        })
                      }
                      placeholder="Enter API key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFaceMatchKey(!showFaceMatchKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showFaceMatchKey ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Min Score Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Score Threshold
              </label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={config.faceMatch.minScore}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    faceMatch: {
                      ...config.faceMatch,
                      minScore: parseFloat(e.target.value),
                    },
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Score range: 0.0 to 1.0 (current: {config.faceMatch.minScore})
              </p>
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => testConnection('faceMatch', setFaceMatchTestStatus)}
                disabled={
                  faceMatchTestStatus.status === 'testing' ||
                  (config.faceMatch.provider !== 'mock' && !config.faceMatch.apiKey)
                }
              >
                Test Connection
              </Button>

              {getStatusIcon(faceMatchTestStatus)}

              {faceMatchTestStatus.message && (
                <span
                  className={`text-sm ${
                    faceMatchTestStatus.status === 'success'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {faceMatchTestStatus.message}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!hasChanges || saving}
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
