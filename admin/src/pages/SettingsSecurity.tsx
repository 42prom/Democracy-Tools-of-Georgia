import { useState, useEffect } from 'react';
import { ShieldCheck, Save, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface RateLimitConfig {
  ip?: number;
  device?: number;
  pn?: number;
  account?: number;
  poll?: number;
  window: number;
}

interface SecurityConfig {
  maxDistinctVotersPerDevicePerPoll: number;
  requireDeviceAttestationForVote: boolean;
  blockVpnAndProxy: boolean;
  vpnDetectionProvider: string;
  vpnDetectionApiKey: string;
  maxBiometricAttemptsPerIP: number;
  biometricIPLimitWindowMinutes: number;
  
  // Rate Limits
  rate_limit_enrollment: RateLimitConfig;
  rate_limit_login: RateLimitConfig;
  rate_limit_biometric: RateLimitConfig;
  rate_limit_vote: RateLimitConfig;
}

const DEFAULT_CONFIG: SecurityConfig = {
  maxDistinctVotersPerDevicePerPoll: 2,
  requireDeviceAttestationForVote: false,
  blockVpnAndProxy: false,
  vpnDetectionProvider: 'iphub',
  vpnDetectionApiKey: '',
  maxBiometricAttemptsPerIP: 10,
  biometricIPLimitWindowMinutes: 60,
  rate_limit_enrollment: { ip: 10, device: 5, pn: 3, window: 60 },
  rate_limit_login: { ip: 20, device: 10, pn: 5, window: 15 },
  rate_limit_biometric: { ip: 10, account: 5, window: 60 },
  rate_limit_vote: { poll: 1, account: 3, window: 1 },
};

function RateLimitSection({ 
  title, 
  description, 
  value, 
  onChange 
}: { 
  title: string; 
  description: string; 
  value: RateLimitConfig; 
  onChange: (newValue: RateLimitConfig) => void; 
}) {
  return (
    <div className="pt-6 border-t border-gray-200">
      <h3 className="text-md font-medium text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {value.ip !== undefined && (
           <div>
             <label className="block text-xs font-medium text-gray-700">Per IP Limit</label>
             <input
               type="number" min="1"
               value={value.ip}
               onChange={(e) => onChange({ ...value, ip: parseInt(e.target.value) || 0 })}
               className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
             />
           </div>
        )}
        {value.device !== undefined && (
           <div>
             <label className="block text-xs font-medium text-gray-700">Per Device Limit</label>
             <input
               type="number" min="1"
               value={value.device}
               onChange={(e) => onChange({ ...value, device: parseInt(e.target.value) || 0 })}
               className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
             />
           </div>
        )}
        {value.pn !== undefined && (
           <div>
             <label className="block text-xs font-medium text-gray-700">Per Private Number</label>
             <input
               type="number" min="1"
               value={value.pn}
               onChange={(e) => onChange({ ...value, pn: parseInt(e.target.value) || 0 })}
               className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
             />
           </div>
        )}
        {value.account !== undefined && (
           <div>
             <label className="block text-xs font-medium text-gray-700">Per Account</label>
             <input
               type="number" min="1"
               value={value.account}
               onChange={(e) => onChange({ ...value, account: parseInt(e.target.value) || 0 })}
               className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
             />
           </div>
        )}
        {value.poll !== undefined && (
           <div>
             <label className="block text-xs font-medium text-gray-700">Per Poll</label>
             <input
               type="number" min="1"
               value={value.poll}
               onChange={(e) => onChange({ ...value, poll: parseInt(e.target.value) || 0 })}
               className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
             />
           </div>
        )}
        
        <div>
           <label className="block text-xs font-medium text-gray-700">Window (Minutes)</label>
           <input
             type="number" min="1"
             value={value.window}
             onChange={(e) => onChange({ ...value, window: parseInt(e.target.value) || 1 })}
             className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
           />
        </div>
      </div>
    </div>
  );
}

export default function SettingsSecurity() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [config, setConfig] = useState<SecurityConfig>(DEFAULT_CONFIG);

  const [vpnTestStatus, setVpnTestStatus] = useState<{
    status: 'idle' | 'testing' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });

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
      
      // Merge received data with default config to ensure all fields exist
      const newConfig: SecurityConfig = {
        ...DEFAULT_CONFIG,
        ...data.security, // If security object exists (legacy or new structure)
      };

      // If backend returns root-level keys for rate limits (as per my updated route)
      // Deep merge rate limits to ensure missing keys from backend don't hide inputs
      if (data.rate_limit_enrollment) newConfig.rate_limit_enrollment = { ...DEFAULT_CONFIG.rate_limit_enrollment, ...data.rate_limit_enrollment };
      if (data.rate_limit_login) newConfig.rate_limit_login = { ...DEFAULT_CONFIG.rate_limit_login, ...data.rate_limit_login };
      if (data.rate_limit_biometric) newConfig.rate_limit_biometric = { ...DEFAULT_CONFIG.rate_limit_biometric, ...data.rate_limit_biometric };
      if (data.rate_limit_vote) newConfig.rate_limit_vote = { ...DEFAULT_CONFIG.rate_limit_vote, ...data.rate_limit_vote };
      
      // Map flattened system_settings keys to our config structure
      if (data.maxDistinctVotersPerDevicePerPoll !== undefined) newConfig.maxDistinctVotersPerDevicePerPoll = data.maxDistinctVotersPerDevicePerPoll;
      if (data.requireDeviceAttestationForVote !== undefined) newConfig.requireDeviceAttestationForVote = data.requireDeviceAttestationForVote;
      if (data.blockVpnAndProxy !== undefined) newConfig.blockVpnAndProxy = data.blockVpnAndProxy;
      if (data.vpnDetectionProvider !== undefined) newConfig.vpnDetectionProvider = data.vpnDetectionProvider;
      if (data.vpnDetectionApiKey !== undefined) newConfig.vpnDetectionApiKey = data.vpnDetectionApiKey;
      if (data.maxBiometricAttemptsPerIP !== undefined) newConfig.maxBiometricAttemptsPerIP = data.maxBiometricAttemptsPerIP;
      if (data.biometricIPLimitWindowMinutes !== undefined) newConfig.biometricIPLimitWindowMinutes = data.biometricIPLimitWindowMinutes;

      // Manually map legacy security fields if they are flattened in root
      if (data.security) {
         newConfig.maxDistinctVotersPerDevicePerPoll = data.security.maxDistinctVotersPerDevicePerPoll || DEFAULT_CONFIG.maxDistinctVotersPerDevicePerPoll;
         newConfig.requireDeviceAttestationForVote = data.security.requireDeviceAttestationForVote || false;
         newConfig.blockVpnAndProxy = data.security.blockVpnAndProxy || false;
         newConfig.vpnDetectionProvider = data.security.vpnDetectionProvider || 'iphub';
         newConfig.vpnDetectionApiKey = data.security.vpnDetectionApiKey || '';
         newConfig.maxBiometricAttemptsPerIP = data.security.maxBiometricAttemptsPerIP || 10;
         newConfig.biometricIPLimitWindowMinutes = data.security.biometricIPLimitWindowMinutes || 60;
      }

      setConfig(newConfig);
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
          // The backend patch handler iterates and saves key/value. 
          // Postgres system_settings.value is JSONB? Or TEXT?
          // Based on dynamicRateLimit.ts, it expects JSON object in value.
          security: {
             // Extract settings from config to match backend expectation
             // Note: backend iterates over keys and saves them to system_settings
             
             // Security Config
             maxDistinctVotersPerDevicePerPoll: config.maxDistinctVotersPerDevicePerPoll,
             requireDeviceAttestationForVote: config.requireDeviceAttestationForVote,
             blockVpnAndProxy: config.blockVpnAndProxy,
             vpnDetectionProvider: config.vpnDetectionProvider,
             vpnDetectionApiKey: config.vpnDetectionApiKey,
             maxBiometricAttemptsPerIP: config.maxBiometricAttemptsPerIP,
             biometricIPLimitWindowMinutes: config.biometricIPLimitWindowMinutes,
          },

             // Rate Limits (saved as JSON strings or objects depending on backend handling)
             rate_limit_enrollment: config.rate_limit_enrollment,
             rate_limit_login: config.rate_limit_login,
             rate_limit_biometric: config.rate_limit_biometric,
             rate_limit_vote: config.rate_limit_vote,
        })
      });

      if (!response.ok) throw new Error('Failed to update settings');

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      // Refresh to get any updated masked keys
      await fetchConfig();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testVpnConnection() {
    setVpnTestStatus({ status: 'testing', message: 'Testing connection...' });

    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('adminToken');
      const response = await fetch('/api/v1/admin/settings/vpn-detection/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          provider: config.vpnDetectionProvider,
          apiKey: config.vpnDetectionApiKey,
        })
      });

      const data = await response.json();

      if (data.success) {
        setVpnTestStatus({
          status: 'success',
          message: data.message || 'Connection successful!',
        });
      } else {
        setVpnTestStatus({
          status: 'error',
          message: data.error || 'Connection failed',
        });
      }
    } catch (err: any) {
      setVpnTestStatus({
        status: 'error',
        message: err.message || 'Connection test failed',
      });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center mb-6">
          <ShieldCheck className="h-6 w-6 text-primary-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">Security Policies</h2>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4 flex items-start">
            <CheckCircle className="h-5 w-5 text-green-400 mr-2 mt-0.5" />
            <p className="text-sm text-green-700">Security policies updated successfully!</p>
          </div>
        )}

        <div className="space-y-6">
          

           {/* Section 1: Device Limits */}
           <div>
              <label className="block text-sm font-medium text-gray-700">Max distinct voters per device</label>
              <input
                  type="number" min="1" max="100"
                  value={config.maxDistinctVotersPerDevicePerPoll}
                  onChange={(e) => setConfig({ ...config, maxDistinctVotersPerDevicePerPoll: parseInt(e.target.value) || 2 })}
                  className="mt-1 w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Limits voters per physical phone per poll.</p>
           </div>
           
           {/* Section: Device Attestation (Root/Jailbreak Check) */}
           <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700">Require Device Attestation</label>
                <p className="text-xs text-gray-500">Only allow trusted devices (Google Play Integrity / Apple App Attest). Blocks Root/Jailbreak.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, requireDeviceAttestationForVote: !config.requireDeviceAttestationForVote })}
                className={`${config.requireDeviceAttestationForVote ? 'bg-primary-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
              >
                <span className={`${config.requireDeviceAttestationForVote ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
              </button>
           </div>

           {/* Section 2: VPN */}
           <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700">Block VPN/Proxy</label>
                <p className="text-xs text-gray-500">Prevent enrollment/voting from anonymizers.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, blockVpnAndProxy: !config.blockVpnAndProxy })}
                className={`${config.blockVpnAndProxy ? 'bg-primary-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
              >
                <span className={`${config.blockVpnAndProxy ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
              </button>
           </div>

           {config.blockVpnAndProxy && (
             <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6 bg-gray-50 p-4 rounded-md">
                 <div className="sm:col-span-3">
                   <label htmlFor="vpn_provider" className="block text-sm font-medium text-gray-700">
                     VPN Detection Provider
                   </label>
                   <select
                     id="vpn_provider"
                     value={config.vpnDetectionProvider}
                     onChange={(e) => setConfig({ ...config, vpnDetectionProvider: e.target.value })}
                     className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md shadow-sm"
                   >
                     <option value="iphub">IPHub (Recommended)</option>
                     <option value="ipqualityscore">IPQualityScore</option>
                   </select>
                 </div>

                 <div className="sm:col-span-3">
                   <label htmlFor="vpn_apikey" className="block text-sm font-medium text-gray-700">
                     API Key
                   </label>
                   <div className="mt-1 flex rounded-md shadow-sm">
                     <input
                       type="text"
                       id="vpn_apikey"
                       value={config.vpnDetectionApiKey}
                       onChange={(e) => setConfig({ ...config, vpnDetectionApiKey: e.target.value })}
                       className="flex-1 focus:ring-primary-500 focus:border-primary-500 block w-full min-w-0 rounded-none rounded-l-md sm:text-sm border-gray-300"
                       placeholder="Enter API Key"
                     />
                     <button
                       type="button"
                       onClick={testVpnConnection}
                       disabled={vpnTestStatus.status === 'testing' || !config.vpnDetectionApiKey}
                       className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                     >
                       {vpnTestStatus.status === 'testing' ? (
                         <Loader2 className="animate-spin h-4 w-4" />
                       ) : (
                         'Test'
                       )}
                     </button>
                   </div>
                   {vpnTestStatus.status !== 'idle' && (
                     <p className={`mt-1 text-xs ${vpnTestStatus.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                       {vpnTestStatus.message}
                     </p>
                   )}
                 </div>
             </div>
           )}
           
           {/* New Rate Limit Sections */}
           
           <RateLimitSection 
              title="Enrollment Rate Limits" 
              description="Limits on new user registrations to prevent mass fake account creation."
              value={config.rate_limit_enrollment}
              onChange={(newVal) => setConfig({ ...config, rate_limit_enrollment: newVal })}
           />

           <RateLimitSection 
              title="Login Rate Limits" 
              description="Brute-force protection for logging in."
              value={config.rate_limit_login}
              onChange={(newVal) => setConfig({ ...config, rate_limit_login: newVal })}
           />

           <RateLimitSection 
              title="Biometric Verification Rate Limits" 
              description="Limits on face scans to prevent spoofing attempts."
              value={config.rate_limit_biometric}
              onChange={(newVal) => setConfig({ ...config, rate_limit_biometric: newVal })}
           />
           
           <RateLimitSection 
              title="Voting Rate Limits" 
              description="Limits on vote submissions to prevent spamming the endpoint."
              value={config.rate_limit_vote}
              onChange={(newVal) => setConfig({ ...config, rate_limit_vote: newVal })}
           />

        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none disabled:opacity-50"
          >
            {saving ? (
               <>
                 <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                 Saving...
               </>
            ) : (
               <>
                 <Save className="-ml-1 mr-2 h-4 w-4" />
                 Save Policies
               </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
