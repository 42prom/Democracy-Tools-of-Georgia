import { useState, useEffect } from 'react';
import { Bell, Save, AlertCircle, Info, Key, FileText, Send } from 'lucide-react';

export default function SettingsNotifications() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [config, setConfig] = useState({
    enabledGlobal: true,
    enabledPolls: true,
    enabledMessages: true,
    serviceAccountJson: '',
    serviceAccountPath: '',
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token') || localStorage.getItem('adminToken');
      const response = await fetch('/api/v1/admin/settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch settings');
      
      const data = await response.json();
      if (data.push) {
        setConfig({
          enabledGlobal: data.push.enabledGlobal,
          enabledPolls: data.push.enabledPolls,
          enabledMessages: data.push.enabledMessages,
          serviceAccountJson: data.push.serviceAccountJson || '',
          serviceAccountPath: data.push.serviceAccountPath || '',
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      const token = localStorage.getItem('admin_token') || localStorage.getItem('adminToken');
      const response = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          push: config
        })
      });
      
      if (!response.ok) throw new Error('Failed to update settings');
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      setError(null);
      setTestResult(null);
      
      const token = localStorage.getItem('admin_token') || localStorage.getItem('adminToken');
      const response = await fetch('/api/v1/admin/settings/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          serviceAccountJson: config.serviceAccountJson,
          serviceAccountPath: config.serviceAccountPath,
        })
      });
      
      const data = await response.json();
      setTestResult({
        success: response.ok,
        message: data.message || data.error || 'Unknown error'
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center mb-6">
          <Bell className="h-6 w-6 text-primary-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">Push Notification Settings</h2>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4 flex items-start">
            <p className="text-sm text-green-700">Notification settings updated successfully!</p>
          </div>
        )}

        <div className="space-y-8">
          {/* Global Toggle */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Global Push Notifications
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Master switch to enable or disable all push notifications platform-wide.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, enabledGlobal: !config.enabledGlobal })}
                className={`${
                  config.enabledGlobal ? 'bg-primary-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2`}
              >
                <span
                  aria-hidden="true"
                  className={`${
                    config.enabledGlobal ? 'translate-x-5' : 'translate-x-0'
                  } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
              </button>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Firebase Credentials */}
          <section className="space-y-6">
            <div className="flex items-center text-sm font-medium text-gray-900 mb-2">
              <Key className="h-4 w-4 mr-2" />
              Firebase Cloud Messaging Credentials
            </div>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Account JSON
                  </label>
                  <div className="relative">
                    <textarea
                        rows={4}
                        value={config.serviceAccountJson}
                        onChange={(e) => setConfig({ ...config, serviceAccountJson: e.target.value })}
                        placeholder='{"type": "service_account", ...}'
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm font-mono"
                    />
                    <div className="mt-1 text-xs text-gray-500 flex items-center">
                        <Info className="h-3 w-3 mr-1" />
                        Paste the full JSON content from your Firebase service account key.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Account Path
                  </label>
                  <div className="relative">
                    <input
                        type="text"
                        value={config.serviceAccountPath}
                        onChange={(e) => setConfig({ ...config, serviceAccountPath: e.target.value })}
                        placeholder="/path/to/firebase-auth.json"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                    <div className="mt-1 text-xs text-gray-500 flex items-center">
                        <FileText className="h-3 w-3 mr-1" />
                        Absolute path on the server filesystem (Option A).
                    </div>
                  </div>
                </div>
            </div>

            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-md border border-gray-200">
                <div className="flex-1">
                    <p className="text-xs text-gray-600">
                        {testResult ? (
                            <span className={testResult.success ? 'text-green-600' : 'text-red-600'}>
                                {testResult.message}
                            </span>
                        ) : (
                            'Verify your configuration format before saving.'
                        )}
                    </p>
                </div>
                <button
                    onClick={handleTestConnection}
                    disabled={testing || (!config.serviceAccountJson && !config.serviceAccountPath)}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                    {testing ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600 mr-2"></div>
                    ) : (
                        <Send className="h-3 w-3 mr-2" />
                    )}
                    Test Connection
                </button>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Poll Notifications */}
          <section className={!config.enabledGlobal ? 'opacity-50 pointer-events-none' : ''}>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  New Poll Notifications
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Send a push notification when a new poll is published.
                </p>
              </div>
              <button
                type="button"
                disabled={!config.enabledGlobal}
                onClick={() => setConfig({ ...config, enabledPolls: !config.enabledPolls })}
                className={`${
                  config.enabledPolls && config.enabledGlobal ? 'bg-primary-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2`}
              >
                <span
                  aria-hidden="true"
                  className={`${
                    config.enabledPolls && config.enabledGlobal ? 'translate-x-5' : 'translate-x-0'
                  } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
              </button>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Message Notifications */}
          <section className={!config.enabledGlobal ? 'opacity-50 pointer-events-none' : ''}>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  New Message Notifications
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Send a push notification when a new administrative message is published.
                </p>
              </div>
              <button
                type="button"
                disabled={!config.enabledGlobal}
                onClick={() => setConfig({ ...config, enabledMessages: !config.enabledMessages })}
                className={`${
                  config.enabledMessages && config.enabledGlobal ? 'bg-primary-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2`}
              >
                <span
                  aria-hidden="true"
                  className={`${
                    config.enabledMessages && config.enabledGlobal ? 'translate-x-5' : 'translate-x-0'
                  } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
              </button>
            </div>
          </section>

          {!config.enabledGlobal && (
            <div className="mt-4 bg-blue-50 p-3 rounded-md flex items-start">
              <Info className="h-4 w-4 text-blue-400 mr-2 mt-0.5" />
              <div className="text-xs text-blue-700">
                <p>Global notifications are currently disabled. Individual category settings are locked until master switch is enabled.</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
