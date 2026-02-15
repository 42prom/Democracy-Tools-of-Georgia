import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import Card from '../components/ui/Card';
import DateTimePicker24h from '../components/ui/DateTimePicker24h';
import { securityEventsApi } from '../api/client';
import type { SecurityEventsSummary } from '../types';
import { clsx } from 'clsx';

export default function SecurityLogs() {
  const [summary, setSummary] = useState<SecurityEventsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadSummary();
  }, [startDate, endDate]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await securityEventsApi.getSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setSummary(data);
    } catch (error) {
      console.error('Failed to load security events:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return 'bg-red-50';
      case 'warning':
        return 'bg-yellow-50';
      default:
        return 'bg-white';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Security Logs</h1>
          <p className="text-gray-600 mt-1">Aggregated security events</p>
        </div>
        <div className="h-96 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Security Logs</h1>
        <p className="text-gray-600 mt-1">Aggregated security events (k-anonymity protected)</p>
      </div>

      {/* Filter Bar */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DateTimePicker24h
            label="Start Date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <DateTimePicker24h
            label="End Date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <div className="flex items-end">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </Card>

      {summary ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card>
              <div className="flex items-center">
                <Shield className="w-8 h-8 text-primary-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Total Events</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {typeof summary.total === 'number'
                      ? summary.total.toLocaleString()
                      : summary.total}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div>
                <p className="text-sm text-gray-500 mb-1">K-Threshold</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summary.metadata.kThreshold}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Minimum count for display
                </p>
              </div>
            </Card>

            <Card variant={summary.metadata.suppressedEvents > 0 ? 'warning' : 'default'}>
              <div>
                <p className="text-sm text-gray-500 mb-1">Suppressed Events</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summary.metadata.suppressedEvents}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Event types below threshold
                </p>
              </div>
            </Card>
          </div>

          {/* Events Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                      Event Type
                    </th>
                   <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                      Severity
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">
                      Count
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-900">
                      Face Match Score
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                      First Seen
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.events.map((event, index) => (
                    <tr
                      key={index}
                      className={clsx(
                        'border-b border-gray-100',
                        getSeverityBg(event.severity)
                      )}
                    >
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">
                        <div className="flex items-center">
                          {getSeverityIcon(event.severity)}
                          <span className="ml-2">{event.eventType}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={clsx(
                            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                            {
                              'bg-red-100 text-red-800':
                                event.severity === 'critical' ||
                                event.severity === 'error',
                              'bg-yellow-100 text-yellow-800':
                                event.severity === 'warning',
                              'bg-blue-100 text-blue-800': event.severity === 'info',
                            }
                          )}
                        >
                          {event.severity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                        {typeof event.count === 'number'
                          ? event.count.toLocaleString()
                          : event.count}
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        {event.biometricScores?.faceMatch.avg ? (
                          <div className="text-gray-900">
                            <div className="font-semibold">
                              {event.biometricScores.faceMatch.avg}
                            </div>
                            <div className="text-xs text-gray-500">
                              {event.biometricScores.faceMatch.min} - {event.biometricScores.faceMatch.max}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {event.firstSeen
                          ? new Date(event.firstSeen).toLocaleString(undefined, { hour12: false })
                          : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {event.lastSeen
                          ? new Date(event.lastSeen).toLocaleString(undefined, { hour12: false })
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {summary.events.length === 0 && (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">No security events in this time range</p>
              </div>
            )}
          </Card>

          {/* Time Range */}
          <div className="mt-4 text-sm text-gray-500 text-center">
            Time range: {new Date(summary.metadata.timeRange.start).toLocaleString(undefined, { hour12: false })} -{' '}
            {new Date(summary.metadata.timeRange.end).toLocaleString(undefined, { hour12: false })}
          </div>
        </>
      ) : (
        <Card className="text-center py-12">
          <p className="text-gray-500">Failed to load security events</p>
        </Card>
      )}
    </div>
  );
}
