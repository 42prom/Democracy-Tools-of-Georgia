import { useState, useEffect } from 'react';
import {
  Globe, Shield, ShieldOff, Plus, Trash2, Search,
  AlertCircle, CheckCircle, Loader2, RefreshCw, MapPin, Ban, CheckCircle2, XCircle
} from 'lucide-react';

// Country list (ISO 3166-1 alpha-2)
const ALL_COUNTRIES = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'CA', name: 'Canada' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KP', name: 'North Korea' },
  { code: 'KR', name: 'South Korea' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LY', name: 'Libya' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'MA', name: 'Morocco' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NO', name: 'Norway' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PS', name: 'Palestine' },
  { code: 'PA', name: 'Panama' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'YE', name: 'Yemen' },
];

function getFlagEmoji(countryCode: string): string {
  if (!countryCode) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

interface GeoSettings {
  geo_blocking_enabled: string;
  geo_provider: string;
  geo_api_key: string;
  log_blocked_attempts: string;
  block_enrollment: string;
  block_voting: string;
  block_admin: string;
}

interface BlockedCountry {
  id: string;
  country_code: string;
  country_name: string;
  block_reason: string;
  blocked_at: string;
  blocked_by_email?: string;
}

interface BlockedIP {
  id: string;
  ip_address: string;
  block_reason: string;
  blocked_at: string;
  expires_at?: string;
  blocked_by_email?: string;
}

interface WhitelistedIP {
  id: string;
  ip_address: string;
  description: string;
  created_at: string;
  created_by_email?: string;
}

interface BlockedLog {
  id: number;
  ip_address: string;
  country_code: string;
  country_name: string;
  block_type: string;
  endpoint: string;
  attempted_at: string;
}

interface Stats {
  total_blocked: number;
  unique_ips: number;
  unique_countries: number;
  blocked_countries_count: number;
  blocked_ips_count: number;
  whitelisted_ips_count: number;
}

export default function SettingsGeoBlocking() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [settings, setSettings] = useState<GeoSettings>({
    geo_blocking_enabled: 'false',
    geo_provider: 'ip-api',
    geo_api_key: '',
    log_blocked_attempts: 'true',
    block_enrollment: 'true',
    block_voting: 'true',
    block_admin: 'false',
  });

  const [blockedCountries, setBlockedCountries] = useState<BlockedCountry[]>([]);
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistedIP[]>([]);
  const [logs, setLogs] = useState<BlockedLog[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_blocked: 0,
    unique_ips: 0,
    unique_countries: 0,
    blocked_countries_count: 0,
    blocked_ips_count: 0,
    whitelisted_ips_count: 0,
  });

  const [activeTab, setActiveTab] = useState<'countries' | 'ips' | 'whitelist' | 'logs' | 'test'>('countries');

  // Forms
  const [newCountry, setNewCountry] = useState({ code: '', name: '', reason: '' });
  const [newIP, setNewIP] = useState({ ip: '', reason: '', expires: '' });
  const [newWhitelist, setNewWhitelist] = useState({ ip: '', description: '' });
  const [searchCountry, setSearchCountry] = useState('');
  const [testIP, setTestIP] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const token = localStorage.getItem('admin_token') || localStorage.getItem('adminToken');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      const [settingsRes, countriesRes, ipsRes, whitelistRes, logsRes, statsRes] = await Promise.all([
        fetch('/api/v1/admin/geo-blocking/settings', { headers }),
        fetch('/api/v1/admin/geo-blocking/countries', { headers }),
        fetch('/api/v1/admin/geo-blocking/blocked-ips', { headers }),
        fetch('/api/v1/admin/geo-blocking/whitelist', { headers }),
        fetch('/api/v1/admin/geo-blocking/logs?limit=50', { headers }),
        fetch('/api/v1/admin/geo-blocking/stats', { headers }),
      ]);

      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (countriesRes.ok) setBlockedCountries(await countriesRes.json());
      if (ipsRes.ok) setBlockedIPs(await ipsRes.json());
      if (whitelistRes.ok) setWhitelist(await whitelistRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err: any) {
      setError(err.message || 'Failed to load geo-blocking data');
    } finally {
      setLoading(false);
    }
  }

  async function updateSettings(updates: Partial<GeoSettings>) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/admin/geo-blocking/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update settings');

      const data = await response.json();
      setSettings(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function blockCountry() {
    if (!newCountry.code) return;

    try {
      const response = await fetch('/api/v1/admin/geo-blocking/countries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          country_code: newCountry.code,
          country_name: newCountry.name,
          reason: newCountry.reason || 'Blocked by admin',
        }),
      });

      if (!response.ok) throw new Error('Failed to block country');

      setNewCountry({ code: '', name: '', reason: '' });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function unblockCountry(code: string) {
    try {
      await fetch(`/api/v1/admin/geo-blocking/countries/${code}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function blockIP() {
    if (!newIP.ip) return;

    try {
      const response = await fetch('/api/v1/admin/geo-blocking/blocked-ips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ip_address: newIP.ip,
          reason: newIP.reason || 'Blocked by admin',
          expires_at: newIP.expires || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to block IP');

      setNewIP({ ip: '', reason: '', expires: '' });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function unblockIP(ip: string) {
    try {
      await fetch(`/api/v1/admin/geo-blocking/blocked-ips/${encodeURIComponent(ip)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addToWhitelist() {
    if (!newWhitelist.ip) return;

    try {
      const response = await fetch('/api/v1/admin/geo-blocking/whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ip_address: newWhitelist.ip,
          description: newWhitelist.description,
        }),
      });

      if (!response.ok) throw new Error('Failed to whitelist IP');

      setNewWhitelist({ ip: '', description: '' });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeFromWhitelist(ip: string) {
    try {
      await fetch(`/api/v1/admin/geo-blocking/whitelist/${encodeURIComponent(ip)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function testIPAddress() {
    if (!testIP) return;

    setTestLoading(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/v1/admin/geo-blocking/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ip_address: testIP }),
      });

      const data = await response.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setTestLoading(false);
    }
  }

  const filteredCountries = ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(searchCountry.toLowerCase()) ||
    c.code.toLowerCase().includes(searchCountry.toLowerCase())
  );

  const availableCountries = filteredCountries.filter(c =>
    !blockedCountries.some(bc => bc.country_code === c.code)
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Globe className="h-6 w-6 text-primary-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">Geo-Blocking</h2>
          </div>
          <button
            onClick={loadAll}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </button>
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
            <p className="text-sm text-green-700">Settings updated successfully!</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500">Blocked Countries</div>
            <div className="text-2xl font-bold text-gray-900">{stats.blocked_countries_count || 0}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500">Blocked IPs</div>
            <div className="text-2xl font-bold text-gray-900">{stats.blocked_ips_count || 0}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500">Whitelisted IPs</div>
            <div className="text-2xl font-bold text-gray-900">{stats.whitelisted_ips_count || 0}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500">Blocked Today</div>
            <div className="text-2xl font-bold text-red-600">{stats.total_blocked || 0}</div>
          </div>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-6">
          <div>
            <div className="flex items-center">
              <Shield className="h-5 w-5 text-primary-600 mr-2" />
              <span className="font-medium text-gray-900">Geo-Blocking Enabled</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Master switch for all geographic restrictions</p>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ geo_blocking_enabled: settings.geo_blocking_enabled === 'true' ? 'false' : 'true' })}
            disabled={saving}
            className={`${settings.geo_blocking_enabled === 'true' ? 'bg-primary-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
          >
            <span className={`${settings.geo_blocking_enabled === 'true' ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
          </button>
        </div>

        {/* Blocking Options */}
        {settings.geo_blocking_enabled === 'true' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <input
                type="checkbox"
                checked={settings.block_enrollment === 'true'}
                onChange={(e) => updateSettings({ block_enrollment: e.target.checked ? 'true' : 'false' })}
                className="h-4 w-4 text-primary-600 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Block Enrollment</span>
            </label>
            <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <input
                type="checkbox"
                checked={settings.block_voting === 'true'}
                onChange={(e) => updateSettings({ block_voting: e.target.checked ? 'true' : 'false' })}
                className="h-4 w-4 text-primary-600 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Block Voting</span>
            </label>
            <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <input
                type="checkbox"
                checked={settings.log_blocked_attempts === 'true'}
                onChange={(e) => updateSettings({ log_blocked_attempts: e.target.checked ? 'true' : 'false' })}
                className="h-4 w-4 text-primary-600 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Log Blocked Attempts</span>
            </label>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'countries', label: 'Countries', icon: MapPin },
              { id: 'ips', label: 'Blocked IPs', icon: Ban },
              { id: 'whitelist', label: 'Whitelist', icon: CheckCircle2 },
              { id: 'logs', label: 'Logs', icon: AlertCircle },
              { id: 'test', label: 'Test IP', icon: Search },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Countries Tab */}
        {activeTab === 'countries' && (
          <div className="space-y-4">
            {/* Add Country Form */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                <Plus className="w-4 h-4 mr-1" />
                Block Country
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <input
                    type="text"
                    placeholder="Search country..."
                    value={searchCountry}
                    onChange={(e) => setSearchCountry(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                  />
                </div>
                <div>
                  <select
                    value={newCountry.code}
                    onChange={(e) => {
                      const country = ALL_COUNTRIES.find(c => c.code === e.target.value);
                      setNewCountry({
                        ...newCountry,
                        code: e.target.value,
                        name: country?.name || '',
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                  >
                    <option value="">Select country...</option>
                    {availableCountries.map(c => (
                      <option key={c.code} value={c.code}>
                        {getFlagEmoji(c.code)} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={newCountry.reason}
                    onChange={(e) => setNewCountry({ ...newCountry, reason: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                  />
                </div>
                <div>
                  <button
                    onClick={blockCountry}
                    disabled={!newCountry.code}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    <ShieldOff className="w-4 h-4 mr-1" />
                    Block
                  </button>
                </div>
              </div>
            </div>

            {/* Blocked Countries List */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Blocked Countries ({blockedCountries.length})
              </h3>
              {blockedCountries.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No countries blocked</p>
              ) : (
                <div className="space-y-2">
                  {blockedCountries.map((country) => (
                    <div
                      key={country.country_code}
                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{getFlagEmoji(country.country_code)}</span>
                        <div>
                          <div className="font-medium text-gray-900">{country.country_name}</div>
                          <div className="text-xs text-gray-500">
                            {country.country_code} • {country.block_reason || 'No reason'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {new Date(country.blocked_at).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => unblockCountry(country.country_code)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Blocked IPs Tab */}
        {activeTab === 'ips' && (
          <div className="space-y-4">
            {/* Add IP Form */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Block IP Address</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="IP Address (e.g., 192.168.1.1)"
                  value={newIP.ip}
                  onChange={(e) => setNewIP({ ...newIP, ip: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                />
                <input
                  type="text"
                  placeholder="Reason"
                  value={newIP.reason}
                  onChange={(e) => setNewIP({ ...newIP, reason: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                />
                <input
                  type="datetime-local"
                  placeholder="Expires (optional)"
                  value={newIP.expires}
                  onChange={(e) => setNewIP({ ...newIP, expires: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                />
                <button
                  onClick={blockIP}
                  disabled={!newIP.ip}
                  className="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  Block IP
                </button>
              </div>
            </div>

            {/* Blocked IPs List */}
            {blockedIPs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No IPs blocked</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blocked</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {blockedIPs.map((ip) => (
                      <tr key={ip.id}>
                        <td className="px-4 py-3 text-sm font-mono">{ip.ip_address}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{ip.block_reason || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(ip.blocked_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {ip.expires_at ? new Date(ip.expires_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => unblockIP(ip.ip_address)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Whitelist Tab */}
        {activeTab === 'whitelist' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Whitelisted IPs bypass all geo-blocking rules.</p>

            {/* Add Whitelist Form */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Add to Whitelist</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="IP Address"
                  value={newWhitelist.ip}
                  onChange={(e) => setNewWhitelist({ ...newWhitelist, ip: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                />
                <input
                  type="text"
                  placeholder="Description (e.g., Office IP)"
                  value={newWhitelist.description}
                  onChange={(e) => setNewWhitelist({ ...newWhitelist, description: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                />
                <button
                  onClick={addToWhitelist}
                  disabled={!newWhitelist.ip}
                  className="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </button>
              </div>
            </div>

            {/* Whitelist List */}
            {whitelist.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No IPs whitelisted</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {whitelist.map((ip) => (
                      <tr key={ip.id}>
                        <td className="px-4 py-3 text-sm font-mono">{ip.ip_address}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{ip.description || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(ip.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => removeFromWhitelist(ip.ip_address)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Blocked Access Log (Last 50)</h3>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No blocked attempts logged</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.attempted_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-mono">{log.ip_address}</td>
                        <td className="px-4 py-3 text-sm">
                          {log.country_code && (
                            <span className="flex items-center gap-1">
                              {getFlagEmoji(log.country_code)} {log.country_name || log.country_code}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            log.block_type === 'country'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {log.block_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{log.endpoint || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Test Tab */}
        {activeTab === 'test' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Test if an IP address would be blocked and view its geo information.</p>

            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter IP address (e.g., 8.8.8.8)"
                value={testIP}
                onChange={(e) => setTestIP(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
              />
              <button
                onClick={testIPAddress}
                disabled={!testIP || testLoading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
                Test
              </button>
            </div>

            {testResult && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Test Result</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">IP Address</div>
                    <div className="font-mono">{testResult.ip}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Status</div>
                    <div className={`flex items-center gap-1 ${testResult.block_status?.blocked ? 'text-red-600' : 'text-green-600'}`}>
                      {testResult.block_status?.blocked ? (
                        <><XCircle className="w-4 h-4" /> BLOCKED</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4" /> ALLOWED</>
                      )}
                    </div>
                  </div>
                  {testResult.geo && (
                    <>
                      <div>
                        <div className="text-xs text-gray-500">Country</div>
                        <div>{getFlagEmoji(testResult.geo.country_code)} {testResult.geo.country_name} ({testResult.geo.country_code})</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Location</div>
                        <div>{testResult.geo.city}, {testResult.geo.region}</div>
                      </div>
                    </>
                  )}
                  {testResult.block_status?.reason && (
                    <div className="col-span-2">
                      <div className="text-xs text-gray-500">Block Reason</div>
                      <div className="text-red-600">{testResult.block_status.reason}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
