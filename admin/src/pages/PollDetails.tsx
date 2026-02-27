import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Users, BarChart3, Clock, MessageSquare, Star } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ReferendumResults from '../components/ReferendumResults';
import DemographicsCharts from '../components/analytics/DemographicsCharts';
import { adminPollsApi, analyticsApi } from '../api/client';
import { formatDate } from '../utils/format';
import type { Poll, PollResults, SurveyResultsResponse } from '../types';

export default function PollDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [results, setResults] = useState<PollResults | null>(null);
  const [surveyResults, setSurveyResults] = useState<SurveyResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadPollData();
    }
  }, [id]);

  const loadPollData = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const pollData = await adminPollsApi.getById(id);
      setPoll(pollData);

      if (pollData.type === 'survey' && pollData.questions && pollData.questions.length > 0) {
        // Load survey-specific results
        const surveyData = await analyticsApi.getSurveyResults(id).catch(() => null);
        setSurveyResults(surveyData);
      } else {
        // Load standard results
        const resultsData = await analyticsApi.getPollResults(id, ['age', 'gender', 'region']).catch(() => null);
        setResults(resultsData);
      }
    } catch (error) {
      console.error('Failed to load poll:', error);
      alert('Failed to load poll details');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    if (!id || !confirm('Are you sure you want to close this poll?')) return;

    try {
      await adminPollsApi.update(id, { status: 'ended' });
      alert('Poll closed successfully');
      navigate('/active');
    } catch (error) {
      console.error('Failed to close poll:', error);
      alert('Failed to close poll');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="p-6">
        <Card className="text-center py-12">
          <p className="text-gray-600">Poll not found</p>
          <Button onClick={() => navigate(-1)} className="mt-4">
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{poll.title}</h1>
            {poll.description && (
              <p className="text-gray-600 mt-2">{poll.description}</p>
            )}

          </div>
          <div className="flex gap-2">
            {poll.status === 'active' && (
              <>
                <Button variant="secondary" onClick={() => navigate(`/polls/${id}/edit`)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={handleClose}>
                  Close Poll
                </Button>
              </>
            )}
            {poll.status === 'draft' && (
              <Button onClick={() => navigate(`/polls/${id}/edit`)}>
                Edit Draft
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Poll Info */}
        <Card className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Poll Information</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center text-sm text-gray-500 mb-1">
                <Calendar className="w-4 h-4 mr-2" />
                Status
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  poll.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : poll.status === 'draft'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {poll.status}
              </span>
            </div>

            <div>
              <div className="flex items-center text-sm text-gray-500 mb-1">
                <Clock className="w-4 h-4 mr-2" />
                Duration
              </div>
              <p className="text-sm text-gray-900">
                {poll.start_at && `Starts: ${formatDate(poll.start_at)}`}
                <br />
                {poll.end_at && `Ends: ${formatDate(poll.end_at)}`}
              </p>
            </div>

            <div>
              <div className="flex items-center text-sm text-gray-500 mb-1">
                <Users className="w-4 h-4 mr-2" />
                Type
              </div>
              <p className="text-sm text-gray-900 capitalize">{poll.type}</p>
            </div>

            {poll.audience_rules && (
              <div>
                <div className="text-sm text-gray-500 mb-1">Audience Rules</div>
                <div className="text-sm text-gray-900 space-y-1">
                  {poll.audience_rules.min_age && (
                    <p>Age: {poll.audience_rules.min_age}+</p>
                  )}
                  {poll.audience_rules.gender && poll.audience_rules.gender !== 'all' && (
                    <p>Gender: {poll.audience_rules.gender}</p>
                  )}
                  {poll.audience_rules.regions && poll.audience_rules.regions.length > 0 && (
                    <p>Regions: {poll.audience_rules.regions.length} selected</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Results */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Results</h2>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>

          {/* Referendum Results */}
          {poll.type === 'referendum' && results && results.totalVotes > 0 ? (
            <ReferendumResults
              results={results}
              referendumQuestion={(poll as any).referendum_question || poll.title}
              threshold={(poll as any).referendum_threshold || 50}
            />
          ) : /* Survey Results */
          poll.type === 'survey' && surveyResults ? (
            <div className="space-y-6">
              <div className="text-sm text-gray-600 mb-4">
                Total Submissions: <span className="font-semibold">{surveyResults.totalSubmissions}</span>
              </div>

              {surveyResults.questions.map((q, qIdx) => (
                <div key={q.questionId} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-primary-100 text-primary-700 text-xs font-semibold px-2 py-1 rounded">
                      Q{qIdx + 1}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      {q.questionType.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 mb-3">{q.questionText}</h3>

                  {/* Single/Multiple Choice Results */}
                  {(q.questionType === 'single_choice' || q.questionType === 'multiple_choice') &&
                    q.results?.options && (
                      <div className="space-y-2">
                        {q.results.options.map((opt: any) => (
                          <div key={opt.optionId} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-800">{opt.optionText}</span>
                              <span className="text-gray-500">
                                {opt.count === '<suppressed>' ? '<k' : `${opt.count} (${opt.percentage}%)`}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                              <div
                                className="bg-primary-600 h-full rounded-full transition-all"
                                style={{
                                  width: `${opt.count === '<suppressed>' ? 0 : opt.percentage}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {/* Rating Scale Results */}
                  {q.questionType === 'rating_scale' && q.results && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Star className="w-5 h-5 text-yellow-500" />
                        <span className="text-xl font-bold text-gray-900">
                          {q.results.average}
                        </span>
                        <span className="text-sm text-gray-500">
                          / {q.results.config?.max || 5} average
                        </span>
                      </div>
                      <div className="space-y-1">
                        {q.results.distribution?.map((d: any) => (
                          <div key={d.value} className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 w-6 text-right">{d.value}</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-yellow-500 h-full rounded-full"
                                style={{
                                  width: `${d.count === '<suppressed>' ? 0 : d.percentage}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-12">
                              {d.count === '<suppressed>' ? '<k' : `${d.percentage}%`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text Response Results */}
                  {q.questionType === 'text' && q.results && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                          {q.results.responseCount} responses collected
                        </span>
                      </div>
                      {q.results.averageLength > 0 && (
                        <p className="text-xs text-gray-500">
                          Average length: {q.results.averageLength} characters
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Individual responses are not displayed to protect respondent anonymity.
                      </p>
                    </div>
                  )}

                  {/* Ranked Choice Results */}
                  {q.questionType === 'ranked_choice' && q.results?.rankings && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 mb-2">Ranked by first-place votes</p>
                      {q.results.rankings.map((r: any, rIdx: number) => (
                        <div key={r.optionId} className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-600 w-6">#{rIdx + 1}</span>
                          <span className="text-sm text-gray-800 flex-1">{r.optionText}</span>
                          <span className="text-xs text-gray-500">
                            {r.firstPlaceCount === '<suppressed>' ? '<k' : `${r.firstPlaceCount} (${r.percentage}%)`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">
                    {q.totalResponses} response{q.totalResponses !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : results && results.totalVotes > 0 ? (
            /* Standard poll results */
            <div className="space-y-8">
              <div className="space-y-4">
                {/* Question Header for Standard/Election Results */}
                <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-primary-500 mb-6">
                   <p className="text-lg font-medium text-gray-900">
                     {(poll.type === 'election' && (poll as any).election_question) ? (poll as any).election_question : poll.title}
                   </p>
                </div>

                <div className="text-sm text-gray-600 mb-4">
                  Total Votes: <span className="font-semibold">{results.totalVotes}</span>
                </div>

                {results.results.map((result) => {
                  const percentage =
                    results.totalVotes > 0
                      ? Math.round((Number(result.count) / results.totalVotes) * 100)
                      : 0;

                  return (
                    <div key={result.optionId} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-gray-900">{result.optionText}</span>
                        <span className="text-gray-600">
                          {result.count} votes ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-primary-600 h-full rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Demographics Charts */}
              <div className="pt-8 border-t border-gray-200">
                <DemographicsCharts results={results} />
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No {poll.type === 'survey' ? 'submissions' : 'votes'} yet</p>
            </div>
          )}
        </Card>
      </div>

      {/* Survey Questions or Options */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold mb-4">
          {poll.type === 'survey' && poll.questions && poll.questions.length > 0
            ? 'Survey Questions'
            : 'Poll Options'}
        </h2>
        <div className="space-y-2">
          {poll.type === 'survey' && poll.questions && poll.questions.length > 0
            ? poll.questions.map((question, qIdx) => (
                <div key={question.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-primary-100 text-primary-700 text-xs font-semibold px-1.5 py-0.5 rounded">
                      Q{qIdx + 1}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      {question.questionType.replace('_', ' ')}
                    </span>
                    {question.required && (
                      <span className="text-xs text-red-500">Required</span>
                    )}
                  </div>
                  <p className="text-gray-900">{question.questionText}</p>
                  {question.options && question.options.length > 0 && (
                    <div className="mt-2 pl-4 space-y-1">
                      {question.options.map((opt, oIdx) => (
                        <div key={opt.id} className="text-sm text-gray-600 flex items-center gap-1">
                          <span className="text-gray-400">
                            {question.questionType === 'single_choice' ? '○' : question.questionType === 'multiple_choice' ? '☐' : `${oIdx + 1}.`}
                          </span>
                          {opt.optionText}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            : poll.options.map((option, index) => (
                <div
                  key={option.id}
                  className="flex items-center p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-gray-600 mr-3">{index + 1}.</span>
                  <span className="text-gray-900">{option.text}</span>
                </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
