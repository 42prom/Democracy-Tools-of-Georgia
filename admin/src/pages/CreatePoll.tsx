import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GripVertical, X, Plus, AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import DateTimePicker24h from '../components/ui/DateTimePicker24h';
import RegionSelector from '../components/ui/RegionSelector';
import { adminPollsApi, regionsApi } from '../api/client';
import type { PollType, QuestionType, AudienceRules, AudienceEstimate, Region } from '../types';

interface PollOption {
  id: string;
  text: string;
}

interface SurveyQuestionUI {
  id: string;
  questionText: string;
  questionType: QuestionType;
  required: boolean;
  options: { id: string; text: string }[];
  config: Record<string, any>;
  collapsed: boolean;
}

const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: 'Single Choice', icon: '○' },
  { value: 'multiple_choice', label: 'Multiple Choice', icon: '☐' },
  { value: 'text', label: 'Text Response', icon: '✎' },
  { value: 'rating_scale', label: 'Rating Scale', icon: '★' },
  { value: 'ranked_choice', label: 'Ranked Choice', icon: '↕' },
];

type EstimateState = 'idle' | 'loading' | 'safe' | 'unsafe';

// Helper to convert Date to YYYY-MM-DDTHH:MM in local timezone
const toLocalISOString = (dateStr?: string | Date) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

// Helper to reliably convert local YYYY-MM-DDTHH:MM string to UTC ISO string
const toUtcISOString = (localStr?: string) => {
  if (!localStr) return undefined;
  // Parse parts manually to avoid browser-specific ambiguity
  const [datePart, timePart] = localStr.split('T');
  if (!datePart || !timePart) return undefined;
  
  const [year, month, day] = datePart.split('-').map(num => parseInt(num, 10));
  const [hours, mins] = timePart.split(':').map(num => parseInt(num, 10));
  
  // This constructor uses the local timezone
  const date = new Date(year, month - 1, day, hours, mins);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
};

export default function CreatePoll() {
  const { id: pollId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!pollId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pollType, setPollType] = useState<PollType>('survey');
  const [options, setOptions] = useState<PollOption[]>([
    { id: '1', text: '' },
    { id: '2', text: '' },
  ]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Audience
  const [allAges, setAllAges] = useState(true);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(100);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [gender, setGender] = useState<'all' | 'M' | 'F'>('all');
  const [regions, setRegions] = useState<Region[]>([]);

  // Survey questions (for survey type)
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestionUI[]>([
    {
      id: 'sq_1',
      questionText: '',
      questionType: 'single_choice',
      required: true,
      options: [
        { id: 'sqo_1_1', text: '' },
        { id: 'sqo_1_2', text: '' },
      ],
      config: {},
      collapsed: false,
    },
  ]);

  // Referendum
  const [referendumOptions, setReferendumOptions] = useState<PollOption[]>([
    { id: 'ref_yes', text: 'Yes' },
    { id: 'ref_no', text: 'No' },
    { id: 'ref_abstain', text: 'Abstain' },
  ]);
  const [referendumThreshold, setReferendumThreshold] = useState(50);

  // Rewards
  const [rewardsEnabled, setRewardsEnabled] = useState(false);
  const [rewardToken, setRewardToken] = useState('DTG');
  const [rewardAmount, setRewardAmount] = useState('0');

  // Estimate
  const [estimateState, setEstimateState] = useState<EstimateState>('idle');
  const [estimateData, setEstimateData] = useState<AudienceEstimate | null>(null);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadRegions();
    if (isEditing && pollId) {
      loadPollData();
    }
  }, [pollId]);

  useEffect(() => {
    // Auto-estimate when audience rules change
    const timer = setTimeout(() => {
      estimateAudience();
    }, 500);
    return () => clearTimeout(timer);
  }, [allAges, minAge, maxAge, selectedRegions, gender]);

  const loadRegions = async () => {
    try {
      const data = await regionsApi.list();
      setRegions(data);
    } catch (error) {
      console.error('Failed to load regions:', error);
    }
  };

  const loadPollData = async () => {
    if (!pollId) return;

    try {
      const poll = await adminPollsApi.getById(pollId);

      // Populate form fields
      setTitle(poll.title);
      setDescription(poll.description || '');
      setPollType(poll.type);
      setOptions(
        poll.options.map((opt) => ({
          id: opt.id || Date.now().toString(),
          text: opt.text,
        }))
      );

      if (poll.start_at) {
        setStartDate(toLocalISOString(poll.start_at));
      }
      if (poll.end_at) {
        setEndDate(toLocalISOString(poll.end_at));
      }

      // Audience rules
      const rules = poll.audience_rules;
      if (rules.min_age !== undefined || rules.max_age !== undefined) {
        setAllAges(false);
        setMinAge(rules.min_age || 18);
        setMaxAge(rules.max_age || 100);
      }
      if (rules.regions && rules.regions.length > 0) {
        setSelectedRegions(rules.regions);
      }
      if (rules.gender && rules.gender !== 'all') {
        setGender(rules.gender);
      }

      // Rewards
      if (poll.rewards_enabled) {
        setRewardsEnabled(true);
        setRewardAmount(poll.reward_amount?.toString() || '0');
        setRewardToken(poll.reward_token || 'DTG');
      }

      if (poll.type === 'election') {
        // No election question to load
      } else if (poll.type === 'referendum') {
        setReferendumThreshold(poll.referendum_threshold || 50);
      }
    } catch (error) {
      console.error('Failed to load poll:', error);
      alert('Failed to load poll for editing');
      navigate('/drafts');
    }
  };

  const addOption = () => {
    setOptions([...options, { id: Date.now().toString(), text: '' }]);
  };

  const removeOption = (id: string) => {
    if (options.length > 2) {
      setOptions(options.filter((opt) => opt.id !== id));
    }
  };

  const updateOption = (id: string, text: string) => {
    setOptions(options.map((opt) => (opt.id === id ? { ...opt, text } : opt)));
  };

  // Survey question management
  const addSurveyQuestion = () => {
    const newId = `sq_${Date.now()}`;
    setSurveyQuestions([
      ...surveyQuestions,
      {
        id: newId,
        questionText: '',
        questionType: 'single_choice',
        required: true,
        options: [
          { id: `${newId}_o1`, text: '' },
          { id: `${newId}_o2`, text: '' },
        ],
        config: {},
        collapsed: false,
      },
    ]);
  };

  const removeSurveyQuestion = (qId: string) => {
    if (surveyQuestions.length > 1) {
      setSurveyQuestions(surveyQuestions.filter((q) => q.id !== qId));
    }
  };

  const updateSurveyQuestion = (qId: string, field: string, value: any) => {
    setSurveyQuestions(
      surveyQuestions.map((q) => {
        if (q.id !== qId) return q;
        const updated = { ...q, [field]: value };
        // When changing question type, reset options/config
        if (field === 'questionType') {
          if (['single_choice', 'multiple_choice', 'ranked_choice'].includes(value)) {
            if (updated.options.length === 0) {
              updated.options = [
                { id: `${qId}_o1`, text: '' },
                { id: `${qId}_o2`, text: '' },
              ];
            }
          }
          if (value === 'rating_scale') {
            updated.config = { min: 1, max: 5, minLabel: 'Strongly Disagree', maxLabel: 'Strongly Agree' };
          } else if (value === 'text') {
            updated.config = { maxLength: 500, placeholder: 'Your answer...' };
          } else {
            updated.config = {};
          }
        }
        return updated;
      })
    );
  };

  const addQuestionOption = (qId: string) => {
    setSurveyQuestions(
      surveyQuestions.map((q) => {
        if (q.id !== qId) return q;
        return {
          ...q,
          options: [...q.options, { id: `${qId}_o${Date.now()}`, text: '' }],
        };
      })
    );
  };

  const removeQuestionOption = (qId: string, oId: string) => {
    setSurveyQuestions(
      surveyQuestions.map((q) => {
        if (q.id !== qId) return q;
        if (q.options.length <= 2) return q;
        return { ...q, options: q.options.filter((o) => o.id !== oId) };
      })
    );
  };

  const updateQuestionOption = (qId: string, oId: string, text: string) => {
    setSurveyQuestions(
      surveyQuestions.map((q) => {
        if (q.id !== qId) return q;
        return {
          ...q,
          options: q.options.map((o) => (o.id === oId ? { ...o, text } : o)),
        };
      })
    );
  };

  const updateQuestionConfig = (qId: string, key: string, value: any) => {
    setSurveyQuestions(
      surveyQuestions.map((q) => {
        if (q.id !== qId) return q;
        return { ...q, config: { ...q.config, [key]: value } };
      })
    );
  };

  const getAudienceRules = (): AudienceRules => {
    return {
      min_age: allAges ? undefined : minAge,
      max_age: allAges ? undefined : maxAge,
      regions: selectedRegions.length > 0 ? selectedRegions : undefined,
      gender: gender === 'all' ? undefined : gender,
    };
  };

  const estimateAudience = async () => {
    setEstimateState('loading');
    try {
      const rules = getAudienceRules();
      const estimate = await adminPollsApi.estimate(rules);
      setEstimateData(estimate);
      setEstimateState(estimate.isPrivacySafe ? 'safe' : 'unsafe');
    } catch (error) {
      console.error('Failed to estimate audience:', error);
      setEstimateState('idle');
    }
  };

  const canPublish = () => {
    // Allow publishing regardless of audience size (admin decision)
    if (title.trim() === '') return false;

    if (pollType === 'survey') {
      return surveyQuestions.some((q) => q.questionText.trim() !== '');
    }

    if (pollType === 'referendum') {
      return referendumOptions.filter((opt) => opt.text.trim() !== '').length >= 2;
    }

    if (pollType === 'election') {
      return options.filter((opt) => opt.text.trim() !== '').length >= 2;
    }

    return options.filter((opt) => opt.text.trim() !== '').length >= 2;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const pollData: any = {
        title,
        description: description || undefined,
        type: pollType,
        audience_rules: getAudienceRules(),
        start_at: toUtcISOString(startDate),
        end_at: toUtcISOString(endDate),
        rewards_enabled: rewardsEnabled,
        reward_amount: rewardsEnabled && rewardAmount ? parseFloat(rewardAmount) : undefined,
        reward_token: rewardsEnabled ? rewardToken : undefined,
      };

      if (pollType === 'survey' && surveyQuestions.some((q) => q.questionText.trim() !== '')) {
        pollData.questions = surveyQuestions
          .filter((q) => q.questionText.trim() !== '')
          .map((q, idx) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            required: q.required,
            displayOrder: idx,
            config: q.config,
            options: ['single_choice', 'multiple_choice', 'ranked_choice'].includes(q.questionType)
              ? q.options.filter((o) => o.text.trim() !== '').map((o, oi) => ({
                  optionText: o.text,
                  displayOrder: oi,
                }))
              : undefined,
          }));
      } else if (pollType === 'referendum') {
        pollData.options = referendumOptions.map((opt) => opt.text).filter((text) => text.trim() !== '');
        pollData.referendum_threshold = referendumThreshold;
      } else if (pollType === 'election') {
        pollData.options = options.map((opt) => opt.text).filter((text) => text.trim() !== '');
      } else {
        pollData.options = options.map((opt) => opt.text).filter((text) => text.trim() !== '');
      }

      if (isEditing && pollId) {
        await adminPollsApi.update(pollId, pollData);
        alert('Poll updated successfully');
        navigate('/drafts');
      } else {
        await adminPollsApi.create(pollData);
        alert('Poll saved as draft');
        resetForm();
      }
    } catch (error) {
      console.error('Failed to save draft:', error);
      alert('Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!canPublish()) return;

    if (!confirm('Are you sure you want to publish this poll? It cannot be edited after publishing.')) {
      return;
    }

    setIsPublishing(true);
    try {
      const pollData: any = {
        title,
        description: description || undefined,
        type: pollType,
        audience_rules: getAudienceRules(),
        start_at: toUtcISOString(startDate),
        end_at: toUtcISOString(endDate),
        rewards_enabled: rewardsEnabled,
        reward_amount: rewardsEnabled && rewardAmount ? parseFloat(rewardAmount) : undefined,
        reward_token: rewardsEnabled ? rewardToken : undefined,
      };

      if (pollType === 'survey' && surveyQuestions.some((q) => q.questionText.trim() !== '')) {
        pollData.questions = surveyQuestions
          .filter((q) => q.questionText.trim() !== '')
          .map((q, idx) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            required: q.required,
            displayOrder: idx,
            config: q.config,
            options: ['single_choice', 'multiple_choice', 'ranked_choice'].includes(q.questionType)
              ? q.options.filter((o) => o.text.trim() !== '').map((o, oi) => ({
                  optionText: o.text,
                  displayOrder: oi,
                }))
              : undefined,
          }));
      } else if (pollType === 'referendum') {
        pollData.options = referendumOptions.map((opt) => opt.text).filter((text) => text.trim() !== '');
        pollData.referendum_threshold = referendumThreshold;
      } else if (pollType === 'election') {
        pollData.options = options.map((opt) => opt.text).filter((text) => text.trim() !== '');
      } else {
        pollData.options = options.map((opt) => opt.text).filter((text) => text.trim() !== '');
      }

      let pollIdToPublish = pollId;

      if (isEditing && pollId) {
        await adminPollsApi.update(pollId, pollData);
      } else {
        const poll = await adminPollsApi.create(pollData);
        pollIdToPublish = poll.id;
      }

      if (pollIdToPublish) {
        await adminPollsApi.publish(pollIdToPublish);
      }

      alert('Poll published successfully');
      if (isEditing) {
        navigate('/active');
      } else {
        resetForm();
      }
    } catch (error: any) {
      console.error('Failed to publish poll:', error);
      const message = error.response?.data?.error?.message || error.message || 'Unknown error';
      alert(`Failed to publish poll: ${message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPollType('survey');
    setOptions([
      { id: '1', text: '' },
      { id: '2', text: '' },
    ]);
    setSurveyQuestions([
      {
        id: 'sq_1',
        questionText: '',
        questionType: 'single_choice',
        required: true,
        options: [
          { id: 'sqo_1_1', text: '' },
          { id: 'sqo_1_2', text: '' },
        ],
        config: {},
        collapsed: false,
      },
    ]);
    setReferendumOptions([
      { id: 'ref_yes', text: 'Yes' },
      { id: 'ref_no', text: 'No' },
      { id: 'ref_abstain', text: 'Abstain' },
    ]);
    setReferendumThreshold(50);
    setStartDate('');
    setEndDate('');
    setAllAges(true);
    setMinAge(18);
    setMaxAge(100);
    setSelectedRegions([]);
    setGender('all');
    setRewardsEnabled(false);
    setRewardAmount('0');
    setRewardToken('DTG');
    setEstimateState('idle');
    setEstimateData(null);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Poll' : 'Create Poll'}
        </h1>
        <p className="text-gray-600 mt-1">
          {isEditing
            ? 'Update poll details and settings'
            : 'Set up a new poll for Georgian citizens'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="col-span-2 space-y-6">
          <Card>
            <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
            <div className="space-y-4">
              <Input
                label="Poll Title"
                placeholder="e.g., Should Georgia join the EU?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <Textarea
                label="Description (optional)"
                placeholder="Provide context for voters..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <Select
                label="Poll Type"
                value={pollType}
                onChange={(e) => setPollType(e.target.value as PollType)}
                options={[
                  { value: 'election', label: 'Election' },
                  { value: 'referendum', label: 'Referendum' },
                  { value: 'survey', label: 'Survey' },
                ]}
              />
            </div>
          </Card>

          {/* Options, Referendum, or Survey Questions based on poll type */}
          {pollType === 'referendum' ? (
            <Card>
              <h2 className="text-lg font-semibold mb-4">Referendum Configuration</h2>
              <div className="space-y-4">
                {/* Referendum Question Input Removed - Title acts as question */}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Response Options
                    </label>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      Role & Color
                    </span>
                  </div>
                  <div className="space-y-2">
                    {referendumOptions.map((opt, index) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <div 
                          title={index === 0 ? "Pass Choice" : index === 1 ? "Reject Choice" : "Neutral Choice"}
                          className={`w-3 h-3 rounded-full shrink-0 ${
                            index === 0 ? 'bg-green-500' : index === 1 ? 'bg-red-500' : 'bg-gray-400'
                          }`} 
                        />
                        <Input
                          placeholder={index === 0 ? "Positive choice (e.g. Yes)" : index === 1 ? "Negative choice (e.g. No)" : "Abstain"}
                          value={opt.text}
                          onChange={(e) =>
                            setReferendumOptions(
                              referendumOptions.map((o) =>
                                o.id === opt.id ? { ...o, text: e.target.value } : o
                              )
                            )
                          }
                          className="flex-1"
                        />
                        {referendumOptions.length > 2 && (
                          <button
                            onClick={() =>
                              setReferendumOptions(referendumOptions.filter((o) => o.id !== opt.id))
                            }
                            className="p-2 text-gray-400 hover:text-red-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {referendumOptions.length < 5 && (
                      <button
                        onClick={() =>
                          setReferendumOptions([
                            ...referendumOptions,
                            { id: `ref_${Date.now()}`, text: '' },
                          ])
                        }
                        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
                      >
                        <Plus className="w-3 h-3" />
                        Add Option
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pass Threshold (%)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={50}
                      max={75}
                      step={5}
                      value={referendumThreshold}
                      onChange={(e) => setReferendumThreshold(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                      {referendumThreshold}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    The {referendumOptions[0]?.text || '"Yes"'} option must reach this percentage (excluding abstentions) to pass.
                  </p>
                </div>

                {/* Referendum Preview */}
                {title && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Preview</p>
                    <p className="text-gray-900 font-medium mb-3">{title}</p>
                    <div className="flex gap-2">
                      {referendumOptions.filter((o) => o.text.trim()).map((opt, i) => (
                        <span
                          key={opt.id}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                            i === 0
                              ? 'bg-green-100 text-green-800'
                              : i === 1
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {opt.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <div className="space-y-6">

              {pollType === 'survey' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Survey Questions</h2>
                    <span className="text-sm text-gray-500">
                      {surveyQuestions.length} question{surveyQuestions.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {surveyQuestions.map((question, qIndex) => (
                    <Card key={question.id}>
                      {/* Question Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="bg-primary-100 text-primary-700 text-xs font-semibold px-2 py-1 rounded">
                            Q{qIndex + 1}
                          </span>
                          <span className="text-xs text-gray-500 font-medium">
                            {QUESTION_TYPE_OPTIONS.find((t) => t.value === question.questionType)?.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              updateSurveyQuestion(question.id, 'collapsed', !question.collapsed)
                            }
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            {question.collapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => removeSurveyQuestion(question.id)}
                            disabled={surveyQuestions.length <= 1}
                            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {!question.collapsed && (
                        <div className="space-y-3">
                          {/* Question Type & Required */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Type
                              </label>
                              <select
                                value={question.questionType}
                                onChange={(e) =>
                                  updateSurveyQuestion(
                                    question.id,
                                    'questionType',
                                    e.target.value as QuestionType
                                  )
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              >
                                {QUESTION_TYPE_OPTIONS.map((type) => (
                                  <option key={type.value} value={type.value}>
                                    {type.icon} {type.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end pb-1">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={question.required}
                                  onChange={(e) =>
                                    updateSurveyQuestion(question.id, 'required', e.target.checked)
                                  }
                                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                />
                                <span className="ml-2 text-sm text-gray-700">Required</span>
                              </label>
                            </div>
                          </div>

                          {/* Question Text */}
                          <Input
                            placeholder="Enter your question..."
                            value={question.questionText}
                            onChange={(e) =>
                              updateSurveyQuestion(question.id, 'questionText', e.target.value)
                            }
                          />

                          {/* Choice Options (for single_choice, multiple_choice, ranked_choice) */}
                          {['single_choice', 'multiple_choice', 'ranked_choice'].includes(
                            question.questionType
                          ) && (
                            <div className="pl-4 border-l-2 border-gray-200 space-y-2">
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Options
                              </label>
                              {question.options.map((opt, oIndex) => (
                                <div key={opt.id} className="flex items-center gap-2">
                                  <span className="text-gray-400 text-xs w-4">
                                    {question.questionType === 'single_choice'
                                      ? '○'
                                      : question.questionType === 'multiple_choice'
                                      ? '☐'
                                      : `${oIndex + 1}.`}
                                  </span>
                                  <Input
                                    placeholder={`Option ${oIndex + 1}`}
                                    value={opt.text}
                                    onChange={(e) =>
                                      updateQuestionOption(question.id, opt.id, e.target.value)
                                    }
                                    className="flex-1"
                                  />
                                  <button
                                    onClick={() => removeQuestionOption(question.id, opt.id)}
                                    disabled={question.options.length <= 2}
                                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addQuestionOption(question.id)}
                                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 ml-6"
                              >
                                <Plus className="w-3 h-3" />
                                Add Option
                              </button>
                            </div>
                          )}

                          {/* Rating Scale Config */}
                          {question.questionType === 'rating_scale' && (
                            <div className="pl-4 border-l-2 border-gray-200 space-y-2">
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Scale Configuration
                              </label>
                              <div className="grid grid-cols-2 gap-3">
                                <Input
                                  label="Min Value"
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={question.config.min || 1}
                                  onChange={(e) =>
                                    updateQuestionConfig(
                                      question.id,
                                      'min',
                                      parseInt(e.target.value)
                                    )
                                  }
                                />
                                <Input
                                  label="Max Value"
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={question.config.max || 5}
                                  onChange={(e) =>
                                    updateQuestionConfig(
                                      question.id,
                                      'max',
                                      parseInt(e.target.value)
                                    )
                                  }
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <Input
                                  label="Min Label"
                                  placeholder="e.g., Strongly Disagree"
                                  value={question.config.minLabel || ''}
                                  onChange={(e) =>
                                    updateQuestionConfig(question.id, 'minLabel', e.target.value)
                                  }
                                />
                                <Input
                                  label="Max Label"
                                  placeholder="e.g., Strongly Agree"
                                  value={question.config.maxLabel || ''}
                                  onChange={(e) =>
                                    updateQuestionConfig(question.id, 'maxLabel', e.target.value)
                                  }
                                />
                              </div>
                              {/* Preview */}
                              <div className="bg-gray-50 p-3 rounded-lg">
                                <p className="text-xs text-gray-500 mb-2">Preview:</p>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">
                                    {question.config.minLabel || 'Min'}
                                  </span>
                                  <div className="flex gap-2">
                                    {Array.from(
                                      {
                                        length:
                                          (question.config.max || 5) -
                                          (question.config.min || 1) +
                                          1,
                                      },
                                      (_, i) => (question.config.min || 1) + i
                                    ).map((val) => (
                                      <div
                                        key={val}
                                        className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs text-gray-600"
                                      >
                                        {val}
                                      </div>
                                    ))}
                                  </div>
                                  <span className="text-xs text-gray-600">
                                    {question.config.maxLabel || 'Max'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Text Config */}
                          {question.questionType === 'text' && (
                            <div className="pl-4 border-l-2 border-gray-200 space-y-2">
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Text Field Configuration
                              </label>
                              <div className="grid grid-cols-2 gap-3">
                                <Input
                                  label="Max Length"
                                  type="number"
                                  min={50}
                                  max={2000}
                                  value={question.config.maxLength || 500}
                                  onChange={(e) =>
                                    updateQuestionConfig(
                                      question.id,
                                      'maxLength',
                                      parseInt(e.target.value)
                                    )
                                  }
                                />
                                <Input
                                  label="Placeholder"
                                  placeholder="Placeholder text..."
                                  value={question.config.placeholder || ''}
                                  onChange={(e) =>
                                    updateQuestionConfig(question.id, 'placeholder', e.target.value)
                                  }
                                />
                              </div>
                              <p className="text-xs text-gray-400">
                                Text responses are stored securely. Only aggregate metrics are shown in analytics (not individual responses).
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}

                  <Button variant="ghost" onClick={addSurveyQuestion} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Question
                  </Button>
                </div>
              ) : (
                <Card>
                  <h2 className="text-lg font-semibold mb-4">Options</h2>
                  <div className="space-y-3">
                    {options.map((option, index) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                        <Input
                          placeholder={`Option ${index + 1}`}
                          value={option.text}
                          onChange={(e) => updateOption(option.id, e.target.value)}
                          className="flex-1"
                        />
                        <button
                          onClick={() => removeOption(option.id)}
                          disabled={options.length <= 2}
                          className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <Button variant="ghost" onClick={addOption} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Option
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          <Card>
            <h2 className="text-lg font-semibold mb-4">Schedule</h2>
            <div className="grid grid-cols-2 gap-4">
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
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold mb-4">Audience</h2>
            <div className="space-y-4">
              {/* Age */}
              <div>
                <label className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    checked={allAges}
                    onChange={(e) => setAllAges(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">
                    All Ages
                  </span>
                </label>
                {!allAges && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <Input
                      label="Min Age"
                      type="number"
                      min={18}
                      max={100}
                      value={minAge}
                      onChange={(e) => setMinAge(parseInt(e.target.value))}
                    />
                    <Input
                      label="Max Age"
                      type="number"
                      min={18}
                      max={100}
                      value={maxAge}
                      onChange={(e) => setMaxAge(parseInt(e.target.value))}
                    />
                  </div>
                )}
              </div>

              {/* Regions */}
              <RegionSelector
                regions={regions}
                selectedRegionIds={selectedRegions}
                onChange={setSelectedRegions}
                helperText="Poll will be available to citizens in these regions. Leave empty for all."
              />

              {/* Gender */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gender
                </label>
                <div className="flex gap-4">
                  {['all', 'M', 'F'].map((g) => (
                    <label key={g} className="flex items-center">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={gender === g}
                        onChange={(e) => setGender(e.target.value as 'all' | 'M' | 'F')}
                        className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        {g === 'all' ? 'All' : g === 'M' ? 'Men' : 'Women'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold mb-4">Rewards</h2>
            <div className="space-y-4">
              {/* Enable Rewards */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={rewardsEnabled}
                    onChange={(e) => setRewardsEnabled(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">
                    Enable rewards for this poll
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Voters will receive tokens as a reward for participating
                </p>
              </div>

              {/* Reward Configuration */}
              {rewardsEnabled && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <Input
                    label="Reward Amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    placeholder="e.g., 10.50"
                  />
                  <Select
                    label="Token"
                    value={rewardToken}
                    onChange={(e) => setRewardToken(e.target.value)}
                    options={[
                      { value: 'DTG', label: 'DTG' },
                      { value: 'ETH', label: 'ETH (Phase 1)' },
                      { value: 'USDC', label: 'USDC (Phase 1)' },
                    ]}
                  />
                </div>
              )}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={isSaving || isPublishing}
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              onClick={handlePublish}
              disabled={!canPublish() || isPublishing || isSaving}
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </Button>
          </div>
        </div>

        {/* Right Panel - Audience Estimate */}
        <div className="col-span-1">
          <Card
            variant={
              estimateState === 'safe'
                ? 'success'
                : estimateState === 'unsafe'
                ? 'danger'
                : 'default'
            }
            className="sticky top-6"
          >
            <h2 className="text-lg font-semibold mb-4">Audience Estimate</h2>

            {estimateState === 'loading' && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
                <p className="text-sm text-gray-600">Calculating Reach...</p>
              </div>
            )}

            {estimateState === 'safe' && estimateData && (
              <div className="flex flex-col items-center py-6">
                <CheckCircle2 className="w-12 h-12 text-green-600 mb-3" />
                <p className="text-2xl font-bold text-gray-900 mb-1">
                  {estimateData.count.toLocaleString()}
                </p>
                <p className="text-sm text-gray-600 mb-4">Estimated Reach</p>
                <div className="w-full p-3 bg-green-100 rounded-lg mb-3">
                  <p className="text-xs text-green-800 text-center">
                    Privacy-safe: Audience meets safety threshold
                  </p>
                </div>
                {rewardsEnabled && rewardAmount && parseFloat(rewardAmount) > 0 && (
                  <div className="w-full p-3 bg-blue-100 rounded-lg border border-blue-300">
                    <p className="text-xs font-semibold text-blue-900 text-center mb-1">
                      🎁 Reward per Vote
                    </p>
                    <p className="text-sm font-bold text-blue-900 text-center">
                      {rewardAmount} {rewardToken}
                    </p>
                  </div>
                )}
              </div>
            )}

            {estimateState === 'unsafe' && estimateData && (
              <div className="flex flex-col items-center py-6">
                <AlertCircle className="w-12 h-12 text-red-600 mb-3" />
                <p className="text-2xl font-bold text-gray-900 mb-1">
                  {estimateData.count}
                </p>
                <p className="text-sm text-gray-600 mb-4">Estimated Reach</p>
                <div className="w-full p-3 bg-red-100 rounded-lg">
                  <p className="text-xs text-red-800 text-center font-medium">
                    Small audience warning
                  </p>
                  <p className="text-xs text-red-700 text-center mt-1">
                    Results may be suppressed for privacy. Consider expanding audience.
                  </p>
                </div>
              </div>
            )}

            {estimateState === 'idle' && (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500">
                  Adjust audience rules to see estimate
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

