import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  AlertTriangle,
  Activity,
  Ban,
  RefreshCw,
  Lock,
  Unlock,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import Card from '../components/ui/Card';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('admin_token') ?? localStorage.getItem('adminToken') ?? '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

interface RiskEntry { ip: string; score: number }
interface RateLimitHotspot { key: string; count: number }
interface BlockedIP { reason: string; expiresInSec: number }

interface ShieldStatus {
  active_blocks: number;
  blocked_ips: Record<string, BlockedIP>;
  risk_scores: RiskEntry[];
  backend_rate_limit_hotspots: RateLimitHotspot[];
  timestamp: string;
}

interface IpLog {
  ip: string;
  riskScore: number;
  isBlocked: boolean;
  blockReason: string | null;
  events: Array<{ timestamp: string; amount: number; reason: string; total_score: number }>;
}

function ttlLabel(sec: number): string {
  if (sec < 0) return 'expired';
  if (sec < 60) return `${sec}s`;
  return `${Math.ceil(sec / 60)}m`;
}

function riskBadge(score: number) {
  if (score >= 100) return 'bg-red-100 text-red-800';
  if (score >= 50) return 'bg-orange-100 text-orange-800';
  return 'bg-yellow-100 text-yellow-800';
}

export default function ShieldDashboard() {
  const [status, setStatus] = useState<ShieldStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [ipLog, setIpLog] = useState<IpLog | null>(null);
  const [ipLogLoading, setIpLogLoading] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/shield/status`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data: ShieldStatus = await res.json();
      setStatus(data);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const fetchIpLog = async (ip: string) => {
    setSelectedIp(ip);
    setIpLogLoading(true);
    setIpLog(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/admin/shield/logs/${encodeURIComponent(ip)}`,
        { headers: getAuthHeaders() }
      );
      const data: IpLog = await res.json();
      setIpLog(data);
    } catch {
      setIpLog(null);
    } finally {
      setIpLogLoading(false);
    }
  };

  const handleUnblock = async (ip: string) => {
    setActionMsg(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/admin/shield/block/${encodeURIComponent(ip)}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      const d = await res.json();
      setActionMsg({ text: d.message ?? 'Unblocked successfully', ok: true });
      await fetchStatus();
      if (selectedIp === ip) setIpLog(null);
    } catch {
      setActionMsg({ text: 'Failed to unblock IP.', ok: false });
    }
  };

  const handleManualBlock = async () => {
    setActionMsg(null);
    if (!manualIp || !manualReason) {
      setActionMsg({ text: 'Both IP and reason are required.', ok: false });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/shield/block`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ip: manualIp, reason: manualReason, durationSec: 3600 }),
      });
      const d = await res.json();
      setActionMsg({ text: d.message ?? 'IP blocked for 1 hour.', ok: true });
      setManualIp('');
      setManualReason('');
      await fetchStatus();
    } catch {
      setActionMsg({ text: 'Failed to block IP.', ok: false });
    }
  };

  const kpiCards = [
    {
      label: 'Active Blocks',
      value: status?.active_blocks ?? '—',
      icon: Ban,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
    },
    {
      label: 'Risk IPs Tracked',
      value: status?.risk_scores.length ?? '—',
      icon: AlertTriangle,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
    },
    {
      label: 'RL Hotspots',
      value: status?.backend_rate_limit_hotspots.length ?? '—',
      icon: Activity,
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
    },
    {
      label: 'Last Refreshed',
      value: status ? new Date(status.timestamp).toLocaleTimeString() : '—',
      icon: Clock,
      iconBg: 'bg-primary-100',
      iconColor: 'text-primary-600',
    },
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Shield Dashboard</h1>
          <p className="text-gray-600 mt-1">Real-time threat monitoring & IP management</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary-600" />
            Shield Dashboard
          </h1>
          <p className="text-gray-600 mt-1">Real-time threat monitoring & IP management</p>
        </div>
        <button
          id="shield-refresh-btn"
          onClick={fetchStatus}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <Card variant="danger" className="mb-4 py-3 px-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-sm text-red-800">{error}</span>
        </Card>
      )}
      {actionMsg && (
        <Card variant={actionMsg.ok ? 'success' : 'danger'} className="mb-4 py-3 px-4">
          <span className="text-sm">{actionMsg.text}</span>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {kpiCards.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
          <Card key={label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">{label}</p>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
              </div>
              <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center', iconBg)}>
                <Icon className={clsx('w-6 h-6', iconColor)} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Blocked IPs + Risk Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Hard-blocked IPs */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-600" />
            Hard-Blocked IPs
          </h2>

          {status && Object.keys(status.blocked_ips).length === 0 ? (
            <div className="text-center py-8">
              <Shield className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No blocked IPs — all clear</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {status && Object.entries(status.blocked_ips).map(([ip, info]) => (
                <div
                  key={ip}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => fetchIpLog(ip)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-red-700">{ip}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        expires {ttlLabel(info.expiresInSec)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{info.reason}</p>
                  </div>
                  <button
                    onClick={() => handleUnblock(ip)}
                    className="ml-2 flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    <Unlock className="w-3 h-3" />
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Top Risk Scores */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            Top Risk Scores
          </h2>

          {status?.risk_scores.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No risk activity detected</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {status?.risk_scores.map(({ ip, score }) => (
                <div
                  key={ip}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => fetchIpLog(ip)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                    <span className="font-mono text-sm font-medium text-gray-800">{ip}</span>
                  </div>
                  <span className={clsx(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold',
                    riskBadge(score)
                  )}>
                    {score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Backend RL Hotspots */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-yellow-600" />
          Backend Rate-Limit Hotspots
        </h2>

        {status?.backend_rate_limit_hotspots.length === 0 ? (
          <p className="text-sm text-gray-500">No active rate limit pressure.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
            {status?.backend_rate_limit_hotspots.map(({ key, count }) => (
              <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="font-mono text-xs text-gray-600 truncate flex-1">{key.replace('rl:', '')}</span>
                <span className={clsx(
                  'ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold',
                  count >= 10 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                )}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* IP Log + Manual Block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IP Event Log */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-600" />
            IP Event Log
            {selectedIp && (
              <span className="ml-1 font-mono text-sm font-normal text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                {selectedIp}
              </span>
            )}
          </h2>

          {!selectedIp && (
            <div className="text-center py-8">
              <ChevronRight className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Click an IP above to view its event log.</p>
            </div>
          )}

          {selectedIp && ipLogLoading && (
            <div className="h-40 bg-gray-200 rounded-lg animate-pulse" />
          )}

          {selectedIp && !ipLogLoading && ipLog && (
            <div>
              {/* Status summary */}
              <div className="flex gap-3 mb-3">
                <span className={clsx(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  ipLog.isBlocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                )}>
                  {ipLog.isBlocked ? 'BLOCKED' : 'ACTIVE'}
                </span>
                <span className={clsx(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold',
                  riskBadge(ipLog.riskScore)
                )}>
                  Risk: {ipLog.riskScore}
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {ipLog.events.length === 0 && (
                  <p className="text-sm text-gray-500">No events logged.</p>
                )}
                {ipLog.events.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded text-xs">
                    <span className="text-gray-400 whitespace-nowrap">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    <span className="font-semibold text-orange-700">+{ev.amount}</span>
                    <span className="text-gray-700 flex-1">{ev.reason}</span>
                    <span className="text-gray-400 whitespace-nowrap">total: {ev.total_score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Manual Block */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-gray-700" />
            Manual IP Block
          </h2>

          <div className="space-y-3">
            <div>
              <label htmlFor="shield-manual-ip" className="block text-sm font-medium text-gray-700 mb-1">
                IP Address
              </label>
              <input
                id="shield-manual-ip"
                type="text"
                value={manualIp}
                onChange={e => setManualIp(e.target.value)}
                placeholder="e.g. 192.168.1.1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="shield-manual-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason
              </label>
              <input
                id="shield-manual-reason"
                type="text"
                value={manualReason}
                onChange={e => setManualReason(e.target.value)}
                placeholder="Reason for block"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <button
              id="shield-block-btn"
              onClick={handleManualBlock}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              <Lock className="w-4 h-4" />
              Block IP (1 hour)
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
