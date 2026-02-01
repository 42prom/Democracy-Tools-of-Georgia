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
  const [settings, setSettings] = useState<AdminSettings>(DEFAULTS);

  const errorMessage = (e: unknown) => {
    type ErrShape = {
      message?: unknown;
      response?: {
        data?: {
          error?: unknown;
        };
      };
    };
    const err = e as ErrShape;
    const apiErr = err.response?.data?.error;
    if (typeof apiErr === 'string' && apiErr.trim()) return apiErr;
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
    return 'Unexpected error';
  };

  useEffect(() => {
    (async () => {
      try {
        const s = await settingsApi.get();
        setSettings({ ...DEFAULTS, ...s, reward_token_id: 1 });
      } catch (e: unknown) {
        // Keep page usable even if backend endpoint isn't present yet
        setError(errorMessage(e) || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await settingsApi.update({
        ...settings,
        reward_token_id: 1,
      });
      setSettings({ ...DEFAULTS, ...updated, reward_token_id: 1 });
    } catch (e: unknown) {
      setError(errorMessage(e) || 'Failed to save settings');
    } finally {
      setSaving(false);
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

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    label="ERC-1155 Contract Address"
                    value={settings.nft_contract_address}
                    onChange={(e) => setSettings((s) => ({ ...s, nft_contract_address: e.target.value }))}
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

              <div className="mt-6 flex justify-end">
                <Button onClick={onSave} disabled={saving}>
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