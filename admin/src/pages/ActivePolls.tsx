import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Clock, MoreVertical, TrendingUp } from 'lucide-react';
import Card from '../components/ui/Card';
import { adminPollsApi, analyticsApi } from '../api/client';
import type { Poll, PollResults } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface PollWithResults extends Poll {
  results?: PollResults;
}

export default function ActivePolls() {
  const navigate = useNavigate();
  const [polls, setPolls] = useState<PollWithResults[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivePolls();
  }, []);

  const loadActivePolls = async () => {
    setLoading(true);
    try {
      const data = await adminPollsApi.list('active');
      const safeData = Array.isArray(data) ? data : [];

      // Load results for each poll
      const pollsWithResults = await Promise.all(
        safeData.map(async (poll) => {
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
      console.error('Failed to load active polls:', error);
      setPolls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClosePoll = async (pollId: string) => {
    if (!confirm('Are you sure you want to close this poll early?')) {
      return;
    }

    try {
      await adminPollsApi.update(pollId, { status: 'ended' });
      setPolls(polls.filter((poll) => poll.id !== pollId));
      alert('Poll closed successfully');
    } catch (error) {
      console.error('Failed to close poll:', error);
      alert('Failed to close poll');
    }
  };

  const getTimeRemaining = (endAt?: string) => {
    if (!endAt) return 'No end date';
    try {
      return formatDistanceToNow(new Date(endAt), { addSuffix: true });
    } catch {
      return 'Invalid date';
    }
  };

  const getParticipationRate = (poll: PollWithResults) => {
    if (!poll.results || typeof poll.results.totalVotes !== 'number') {
      return 0;
    }
    // Mock: assume 10000 eligible voters
    const eligible = 10000;
    return Math.round((poll.results.totalVotes / eligible) * 100);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Active Polls</h1>
          <p className="text-gray-600 mt-1">Currently running polls</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Active Polls</h1>
        <p className="text-gray-600 mt-1">Currently running polls</p>
      </div>

      {polls.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            No active polls
          </h2>
          <p className="text-gray-600 text-center max-w-md">
            Publish a poll to see it here. Active polls will appear once published.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {polls.map((poll) => (
            <Card key={poll.id} className="flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Live
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/polls/${poll.id}`)}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="More options"
                >
                  <MoreVertical className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {poll.title}
              </h3>

              {poll.description && (
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                  {poll.description}
                </p>
              )}

              {poll.type === 'referendum' && (poll as any).referendum_question && (
                <p className="text-sm font-medium text-gray-900 mb-4 bg-primary-50 p-2 rounded border border-primary-100">
                  <span className="text-[10px] text-primary-600 uppercase font-bold block mb-1">Referendum Question</span>
                  {(poll as any).referendum_question}
                </p>
              )}

              {poll.type === 'election' && (poll as any).election_question && (
                <p className="text-sm font-medium text-gray-900 mb-4 bg-primary-50 p-2 rounded border border-primary-100">
                  <span className="text-[10px] text-primary-600 uppercase font-bold block mb-1">Election Question</span>
                  {(poll as any).election_question}
                </p>
              )}

              <div className="flex items-center text-sm text-gray-500 mb-4">
                <Clock className="w-4 h-4 mr-1.5" />
                Ends {getTimeRemaining(poll.end_at)}
              </div>

              {/* Mini Chart */}
              <div className="flex-1 flex flex-col justify-end">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Participation
                    </span>
                    <TrendingUp className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {getParticipationRate(poll)}%
                    </span>
                    <span className="text-sm text-gray-500">
                      {poll.results && typeof poll.results.totalVotes === 'number'
                        ? poll.results.totalVotes
                        : 0}{' '}
                      votes
                    </span>
                  </div>
                  <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 rounded-full transition-all"
                      style={{ width: `${getParticipationRate(poll)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/polls/${poll.id}`)}
                    className="flex-1 text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => handleClosePoll(poll.id)}
                    className="flex-1 text-sm font-medium text-gray-600 hover:text-gray-700"
                  >
                    Close Early
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
