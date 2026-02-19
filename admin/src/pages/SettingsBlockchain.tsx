import { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { settingsApi, type AdminSettings } from '../api/client';

const DEFAULTS: AdminSettings = {
  rewards_enabled_global: false,
  nft_payouts_enabled_global: false,
  chain_id: 1337,
  rpc_url: '',
  nft_contract_address: '',
  reward_token_id: 1,
  required_confirmations: 3,
};

export default function SettingsBlockchain() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [settings, setSettings] = useState<AdminSettings>(DEFAULTS);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await settingsApi.get();
      // Merge with defaults to ensure all fields exist
      setSettings(s => ({ ...s, ...data }));
    } catch (error: any) {
       console.error('Failed to load settings:', error);
       setError(errorMessage(error) || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError('');
    try {
      await settingsApi.update(settings);
    } catch (e: any) {
      setError(errorMessage(e) || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const errorMessage = (e: any) => e.response?.data?.error || e.message;

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const res = await settingsApi.testBlockchainConnection(settings.rpc_url);
      setTestResult(res);
    } catch (e: unknown) {
      setError(errorMessage(e) || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900">Blockchain & Rewards</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure your private chain RPC and the single ERC-1155 reward NFT (tokenId is fixed to 1).
          </p>

          {loading ? (
            <div className="mt-6 text-sm text-gray-600">Loading…</div>
          ) : (
            <>
              {error && (
                <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {testResult && (
                <div className={`mt-4 rounded border p-3 text-sm ${
                  testResult.success 
                    ? 'border-green-200 bg-green-50 text-green-700' 
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  {testResult.message}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
{/* ... grid content ... */}
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={settings.rewards_enabled_global}
                    onChange={(e) => setSettings((s) => ({ ...s, rewards_enabled_global: e.target.checked }))}
                  />
                  Rewards enabled (global)
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={settings.nft_payouts_enabled_global}
                    onChange={(e) => setSettings((s) => ({ ...s, nft_payouts_enabled_global: e.target.checked }))}
                  />
                  NFT payouts enabled (global)
                </label>

                <div>
                  <Input
                    label="Chain ID"
                    type="number"
                    value={settings.chain_id}
                    onChange={(e) => setSettings((s) => ({ ...s, chain_id: Number(e.target.value) }))}
                    placeholder="1337"
                  />
                </div>

                <div>
                  <Input
                    label="RPC URL"
                    value={settings.rpc_url}
                    onChange={(e) => setSettings((s) => ({ ...s, rpc_url: e.target.value }))}
                    placeholder="https://rpc.your-private-chain.local"
                  />
                </div>

                <div className="md:col-span-2">
                  <Input
                    label="ERC-1155 Contract Address (Rewards NFT)"
                    value={settings.nft_contract_address}
                    onChange={(e) => setSettings((s) => ({ ...s, nft_contract_address: e.target.value }))}
                    placeholder="0x..."
                  />
                </div>

                <div className="md:col-span-2">
                  <Input
                    label="DTG Token Address (ERC-20)"
                    value={settings.dtg_token_address || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, dtg_token_address: e.target.value }))}
                    placeholder="0x..."
                  />
                </div>

                <div>
                  <Input
                    label="Reward Token ID (fixed)"
                    value={1}
                    disabled
                  />
                </div>

                <div>
                  <Input
                    label="Required confirmations"
                    type="number"
                    value={settings.required_confirmations}
                    onChange={(e) => setSettings((s) => ({ ...s, required_confirmations: Number(e.target.value) }))}
                    placeholder="3"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={onTest} disabled={testing || saving}>
                  {testing ? 'Testing…' : 'Test connection'}
                </Button>
                <Button onClick={onSave} disabled={saving || testing}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6 text-sm text-gray-700 space-y-2">
          <div><b>Note:</b> This page is safe to add now — if the backend endpoint doesn’t exist yet, it will show an error but won’t break other admin features.</div>
          <div><b>Next:</b> Implement backend endpoints <code>/api/v1/admin/settings</code> and reward mint job templates included in this pack.</div>
        </div>
      </Card>
    </div>
  );
}