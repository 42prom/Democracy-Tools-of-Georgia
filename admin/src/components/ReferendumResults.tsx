import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { PollResults } from '../types';

interface ReferendumResultsProps {
  results: PollResults;
  referendumQuestion?: string;
  threshold?: number;
}

const OPTION_COLORS: Record<string, string> = {
  yes: '#22c55e',
  no: '#ef4444',
  abstain: '#9ca3af',
};

function getOptionColor(text: string, index: number): string {
  const lower = text.toLowerCase();
  if (lower === 'yes' || lower === 'for' || lower === 'approve') return OPTION_COLORS.yes;
  if (lower === 'no' || lower === 'against' || lower === 'reject') return OPTION_COLORS.no;
  if (lower === 'abstain' || lower === 'neutral') return OPTION_COLORS.abstain;
  const fallback = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
  return fallback[index % fallback.length];
}

function determineOutcome(
  results: PollResults,
  threshold: number
): { passed: boolean | null; yesPercent: number; noPercent: number; abstainPercent: number } {
  let yesCount = 0;
  let noCount = 0;
  let abstainCount = 0;
  let totalVotes = 0;

  for (const r of results.results) {
    const count = typeof r.count === 'number' ? r.count : 0;
    const lower = r.optionText.toLowerCase();
    totalVotes += count;

    if (lower === 'yes' || lower === 'for' || lower === 'approve') {
      yesCount += count;
    } else if (lower === 'no' || lower === 'against' || lower === 'reject') {
      noCount += count;
    } else {
      abstainCount += count;
    }
  }

  if (totalVotes === 0) {
    return { passed: null, yesPercent: 0, noPercent: 0, abstainPercent: 0 };
  }

  const decisiveVotes = yesCount + noCount;
  const yesPercent = decisiveVotes > 0 ? (yesCount / decisiveVotes) * 100 : 0;
  const noPercent = decisiveVotes > 0 ? (noCount / decisiveVotes) * 100 : 0;
  const abstainPercent = totalVotes > 0 ? (abstainCount / totalVotes) * 100 : 0;

  return {
    passed: decisiveVotes > 0 ? yesPercent >= threshold : null,
    yesPercent,
    noPercent,
    abstainPercent,
  };
}

export default function ReferendumResults({ results, referendumQuestion, threshold = 50 }: ReferendumResultsProps) {
  const outcome = determineOutcome(results, threshold);

  const pieData = results.results
    .filter((r) => typeof r.count === 'number' && r.count > 0)
    .map((r, i) => ({
      name: r.optionText,
      value: typeof r.count === 'number' ? r.count : 0,
      color: getOptionColor(r.optionText, i),
    }));

  const totalVotes = typeof results.totalVotes === 'number' ? results.totalVotes : 0;

  return (
    <div className="space-y-6">
      {/* Referendum Question */}
      {referendumQuestion && (
        <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-primary-500">
          <p className="text-lg font-medium text-gray-900">{referendumQuestion}</p>
        </div>
      )}

      {/* Outcome Badge */}
      {outcome.passed !== null && (
        <div className="flex justify-center">
          <div
            className={`px-6 py-3 rounded-full text-lg font-bold ${
              outcome.passed
                ? 'bg-green-100 text-green-800 border-2 border-green-300'
                : 'bg-red-100 text-red-800 border-2 border-red-300'
            }`}
          >
            {outcome.passed ? 'PASSED' : 'REJECTED'}
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Total Votes</p>
          <p className="text-xl font-bold text-gray-900">
            {totalVotes.toLocaleString()}
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-green-600 mb-1">Yes</p>
          <p className="text-xl font-bold text-green-700">
            {outcome.yesPercent.toFixed(1)}%
          </p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-xs text-red-600 mb-1">No</p>
          <p className="text-xl font-bold text-red-700">
            {outcome.noPercent.toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Abstain</p>
          <p className="text-xl font-bold text-gray-600">
            {outcome.abstainPercent.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Threshold Indicator */}
      <div className="relative">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>0%</span>
          <span className="font-medium">Pass threshold: {threshold}%</span>
          <span>100%</span>
        </div>
        <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-green-500 rounded-l-full transition-all"
            style={{ width: `${outcome.yesPercent}%` }}
          />
          {/* Threshold marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-800"
            style={{ left: `${threshold}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-green-600 font-medium">
            Yes: {outcome.yesPercent.toFixed(1)}%
          </span>
          <span className="text-red-600 font-medium">
            No: {outcome.noPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Vote Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(((percent ?? 0) * 100)).toFixed(0)}%`}
                  labelLine={true}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value?: number) => [(value ?? 0).toLocaleString(), 'Votes']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Demographic Breakdowns as Bar Charts */}
      {results.breakdowns && Object.keys(results.breakdowns).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Demographic Breakdown</h3>
          {Object.entries(results.breakdowns).map(([dimension, breakdown]) => (
            <div key={dimension} className="mb-6">
              <h4 className="text-xs font-medium text-gray-500 mb-2 capitalize">
                {dimension.replace('_', ' ')}
              </h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={breakdown.cohorts.filter((c) => typeof c.count === 'number')}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="value" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#3b82f6" name="Votes" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* K-Anonymity Info */}
      <div className="pt-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
        <span>K-Threshold: {results.metadata.kThreshold}</span>
        <span>Suppressed: {results.metadata.suppressedCells} cells</span>
        <span>Updated: {new Date(results.metadata.lastUpdated).toLocaleString(undefined, { hour12: false })}</span>
      </div>
    </div>
  );
}
