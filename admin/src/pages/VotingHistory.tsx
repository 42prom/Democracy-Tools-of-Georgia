import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Eye, Search, X } from 'lucide-react';
import Card from '../components/ui/Card';
import ReferendumResults from '../components/ReferendumResults';
import { adminPollsApi, analyticsApi } from '../api/client';
import type { Poll, PollResults } from '../types';

interface HistoricalPoll extends Poll {
  results?: PollResults;
}

export default function VotingHistory() {
  const [polls, setPolls] = useState<HistoricalPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoll, setSelectedPoll] = useState<HistoricalPoll | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPolls = useMemo(() => {
    if (!searchQuery.trim()) return polls;
    const query = searchQuery.toLowerCase().trim();
    return polls.filter((poll) => poll.title.toLowerCase().includes(query));
  }, [polls, searchQuery]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await adminPollsApi.list('ended');

      // Load results for each poll
      const pollsWithResults = await Promise.all(
        data.map(async (poll) => {
          try {
            const results = await analyticsApi.getPollResults(poll.id);
            return { ...poll, results };
          } catch (error) {
            console.error(`Failed to load results for poll ${poll.id}:`, error);
            return poll;
          }
        })
      );

      setPolls(pollsWithResults);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Voting History</h1>
          <p className="text-gray-600 mt-1">Past polls and results</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Voting History</h1>
        <p className="text-gray-600 mt-1">Past polls and results</p>
      </div>

      {polls.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            No closed polls
          </h2>
          <p className="text-gray-600 text-center max-w-md">
            Closed polls will appear here with aggregated results.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Polls List */}
          <div className="lg:col-span-1 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search polls by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {filteredPolls.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                No polls match "{searchQuery}"
              </div>
            ) : null}

            {filteredPolls.map((poll) => (
              <Card
                key={poll.id}
                className={`cursor-pointer transition-all ${
                  selectedPoll?.id === poll.id
                    ? 'ring-2 ring-primary-500'
                    : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedPoll(poll)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 flex-1">{poll.title}</h3>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    poll.type === 'referendum'
                      ? 'bg-purple-100 text-purple-700'
                      : poll.type === 'survey'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {poll.type}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {poll.results && typeof poll.results.totalVotes === 'number'
                      ? poll.results.totalVotes
                      : 0}{' '}
                    votes
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    Closed
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {/* Results Detail */}
          <div className="lg:col-span-2">
            {selectedPoll ? (
              <Card>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedPoll.title}
                  </h2>
                  {selectedPoll.description && (
                    <p className="text-gray-600 mt-2">{selectedPoll.description}</p>
                  )}
                </div>

                {selectedPoll.results ? (
                  selectedPoll.type === 'referendum' ? (
                    <ReferendumResults
                      results={selectedPoll.results}
                      referendumQuestion={(selectedPoll as any).referendum_question}
                      threshold={(selectedPoll as any).referendum_threshold || 50}
                    />
                  ) : (
                  <div className="space-y-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-sm text-gray-500">Total Votes</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {typeof selectedPoll.results.totalVotes === 'number'
                              ? selectedPoll.results.totalVotes.toLocaleString()
                              : selectedPoll.results.totalVotes}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">K-Threshold</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {selectedPoll.results.metadata.kThreshold}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Suppressed Cells</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {selectedPoll.results.metadata.suppressedCells}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-4">Results by Option</h3>
                      <div className="space-y-3">
                        {selectedPoll.results.results.map((result) => (
                          <div key={result.optionId}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700">
                                {result.optionText}
                              </span>
                              <span className="text-sm text-gray-600">
                                {typeof result.count === 'number'
                                  ? `${result.count.toLocaleString()} votes`
                                  : result.count}
                                {result.percentage !== undefined &&
                                  ` (${result.percentage.toFixed(1)}%)`}
                              </span>
                            </div>
                            {typeof result.count === 'number' &&
                              result.percentage !== undefined && (
                                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary-600 rounded-full transition-all"
                                    style={{ width: `${result.percentage}%` }}
                                  />
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedPoll.results.breakdowns && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4">
                          Demographic Breakdowns
                        </h3>
                        {Object.entries(selectedPoll.results.breakdowns).map(
                          ([dimension, breakdown]) => (
                            <div key={dimension} className="mb-6">
                              <h4 className="text-sm font-medium text-gray-700 mb-2 capitalize">
                                {dimension.replace('_', ' ')}
                              </h4>
                              <div className="space-y-2">
                                {breakdown.cohorts.map((cohort) => (
                                  <div
                                    key={cohort.value}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span className="text-gray-600">
                                      {cohort.value}
                                    </span>
                                    <span className="font-medium text-gray-900">
                                      {typeof cohort.count === 'number'
                                        ? cohort.count.toLocaleString()
                                        : cohort.count}
                                      {cohort.percentage !== undefined &&
                                        ` (${cohort.percentage.toFixed(1)}%)`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-500">
                        Last updated:{' '}
                        {new Date(
                          selectedPoll.results.metadata.lastUpdated
                        ).toLocaleString(undefined, { hour12: false })}
                      </p>
                    </div>
                  </div>
                  )
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">
                      Results not available for this poll
                    </p>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="flex flex-col items-center justify-center h-full py-12">
                <Eye className="w-12 h-12 text-gray-400 mb-3" />
                <p className="text-gray-600">Select a poll to view results</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
