import { useState, useEffect } from 'react';
import { BarChart3, Shield, AlertTriangle, Info } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { insightsApi } from '../api/client';
import type { InsightsResponse, InsightsDimension } from '../types';

export default function Insights() {
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([
    'ageBucket',
    'genderBucket',
    'regionBucket',
  ]);
  const [minDate, setMinDate] = useState('');
  const [maxDate, setMaxDate] = useState('');
  const [queryCount, setQueryCount] = useState(0);
  const [lastQueryTime, setLastQueryTime] = useState<Date | null>(null);

  const QUERY_BUDGET_LIMIT = 20; // Max queries per session
  const MIN_TIME_WINDOW_HOURS = 24; // Minimum time window for queries

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    setLoading(true);
    try {
      // Validate minimum time window
      if (minDate && maxDate) {
        const start = new Date(minDate);
        const end = new Date(maxDate);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        if (diffHours < MIN_TIME_WINDOW_HOURS) {
          alert(`Time window must be at least ${MIN_TIME_WINDOW_HOURS} hours to prevent inference attacks`);
          setLoading(false);
          return;
        }
      }

      // Check query budget
      if (queryCount >= QUERY_BUDGET_LIMIT) {
        alert('Query budget exceeded. Please refresh the page to reset.');
        setLoading(false);
        return;
      }

      const response = await insightsApi.getDistributions({
        dimensions: selectedDimensions.length > 0 ? selectedDimensions : undefined,
        minDate: minDate || undefined,
        maxDate: maxDate || undefined,
      });

      setInsights(response);
      setQueryCount(queryCount + 1);
      setLastQueryTime(new Date());
    } catch (error) {
      console.error('Failed to load insights:', error);
      alert('Failed to load insights. This may be due to privacy constraints.');
    } finally {
      setLoading(false);
    }
  };

  const handleDimensionToggle = (dimension: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(dimension)
        ? prev.filter((d) => d !== dimension)
        : [...prev, dimension]
    );
  };

  const renderDimensionChart = (dimension: InsightsDimension) => {
    const maxCount = Math.max(
      ...dimension.cohorts
        .filter((c) => typeof c.count === 'number')
        .map((c) => c.count as number)
    );

    return (
      <Card key={dimension.dimension}>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 capitalize">
            Distribution by {dimension.dimension.replace(/([A-Z])/g, ' $1').trim()}
          </h3>
          <div className="space-y-3">
            {dimension.cohorts.map((cohort, idx) => {
              const isSupressed = typeof cohort.count === 'string';
              const countValue = isSupressed ? 0 : (cohort.count as number);
              const percentage = cohort.percentage || 0;
              const barWidth = isSupressed ? 0 : (countValue / maxCount) * 100;

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{cohort.value}</span>
                    <div className="flex items-center gap-2">
                      {isSupressed ? (
                        <span className="text-red-600 font-medium flex items-center">
                          <Shield className="w-4 h-4 mr-1" />
                          {cohort.count}
                        </span>
                      ) : (
                        <>
                          <span className="text-gray-900 font-semibold">{countValue}</span>
                          {percentage > 0 && (
                            <span className="text-gray-500">({percentage.toFixed(1)}%)</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="relative h-6 bg-gray-100 rounded overflow-hidden">
                    {isSupressed ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-red-50">
                        <span className="text-xs text-red-700 font-medium">
                          Suppressed (k-anonymity)
                        </span>
                      </div>
                    ) : (
                      <div
                        className="h-full bg-primary-500 rounded transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  };

  if (loading && !insights) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">User Insights</h1>
          <p className="text-gray-600 mt-1">Aggregated distributions with privacy protection</p>
        </div>
        <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Insights</h1>
        <p className="text-gray-600 mt-1">
          Aggregated distributions with k-anonymity enforcement
        </p>
      </div>

      {/* Privacy Notice */}
      <Card className="mb-6">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                Privacy Protection Enabled
              </h3>
              <p className="text-xs text-blue-800 leading-relaxed">
                All data is aggregated with k-anonymity enforcement (k ={' '}
                {insights?.metadata.kThreshold || 30}). Cohorts with fewer than k users are
                suppressed to prevent re-identification. Query budget: {queryCount}/
                {QUERY_BUDGET_LIMIT}. Minimum time window: {MIN_TIME_WINDOW_HOURS} hours.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Query Controls */}
      <Card className="mb-6">
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Select Dimensions
            </label>
            <div className="flex gap-3 flex-wrap">
              {['ageBucket', 'genderBucket', 'regionBucket'].map((dim) => (
                <label key={dim} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDimensions.includes(dim)}
                    onChange={() => handleDimensionToggle(dim)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 capitalize">
                    {dim.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enrollment Date From
              </label>
              <input
                type="date"
                value={minDate}
                onChange={(e) => setMinDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enrollment Date To
              </label>
              <input
                type="date"
                value={maxDate}
                onChange={(e) => setMaxDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={loadInsights} disabled={loading || queryCount >= QUERY_BUDGET_LIMIT}>
              <BarChart3 className="w-4 h-4 mr-2" />
              {loading ? 'Loading...' : 'Query Insights'}
            </Button>
            {queryCount >= QUERY_BUDGET_LIMIT && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertTriangle className="w-4 h-4" />
                Query budget exceeded
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Insights Metadata */}
      {insights && (
        <Card className="mb-6">
          <div className="p-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Total Users</div>
                <div className="text-2xl font-bold text-gray-900">
                  {typeof insights.totalUsers === 'string' ? (
                    <span className="text-red-600 text-base flex items-center">
                      <Shield className="w-4 h-4 mr-1" />
                      {insights.totalUsers}
                    </span>
                  ) : (
                    insights.totalUsers.toLocaleString()
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">K-Threshold</div>
                <div className="text-2xl font-bold text-primary-600">
                  {insights.metadata.kThreshold}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Suppressed Cells</div>
                <div className="text-2xl font-bold text-red-600">
                  {insights.metadata.suppressedCells}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Last Updated</div>
                <div className="text-sm font-medium text-gray-900">
                  {new Date(insights.metadata.queryTimestamp).toLocaleString(undefined, { hour12: false })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Dimension Charts */}
      {insights && insights.dimensions.length > 0 ? (
        <div className="space-y-6">
          {insights.dimensions.map((dimension) => renderDimensionChart(dimension))}
        </div>
      ) : (
        <Card>
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">
              {queryCount >= QUERY_BUDGET_LIMIT
                ? 'Query budget exceeded. Please refresh to reset.'
                : 'Select dimensions and click "Query Insights" to view distributions'}
            </p>
          </div>
        </Card>
      )}

      {/* Inference Defense Notice */}
      {insights && insights.metadata.suppressedCells > 0 && (
        <Card className="mt-6">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                  Inference Attack Defenses Active
                </h3>
                <p className="text-xs text-yellow-800 leading-relaxed">
                  {insights.metadata.suppressedCells} cohort(s) have been suppressed to prevent
                  re-identification through inference attacks. Overlap queries are blocked, and a
                  minimum {MIN_TIME_WINDOW_HOURS}-hour time window is enforced. Query budget
                  limits multiple correlated queries.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Last Query Info */}
      {lastQueryTime && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          Last query: {lastQueryTime.toLocaleTimeString(undefined, { hour12: false })} | Queries remaining:{' '}
          {QUERY_BUDGET_LIMIT - queryCount}
        </div>
      )}
    </div>
  );
}
