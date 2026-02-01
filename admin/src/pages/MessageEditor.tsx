import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Eye } from 'lucide-react';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import DateTimePicker24h from '../components/ui/DateTimePicker24h';
import MessagePreview from '../components/MessagePreview';
import { adminMessagesApi, regionsApi } from '../api/client';
import type { MessageType, Region } from '../types';

export default function MessageEditor() {
  const { id: messageId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!messageId;

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('announcement');
  const [publishAt, setPublishAt] = useState('');
  const [expireAt, setExpireAt] = useState('');

  // Audience (same pattern as CreatePoll)
  const [allAges, setAllAges] = useState(true);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(100);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [gender, setGender] = useState<'all' | 'M' | 'F'>('all');
  const [regions, setRegions] = useState<Region[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditing);

  useEffect(() => {
    loadRegions();
    if (isEditing) loadMessageData();
  }, [messageId]);

  const loadRegions = async () => {
    try {
      const data = await regionsApi.list();
      setRegions(data);
    } catch (error) {
      console.error('Failed to load regions:', error);
    }
  };

  const loadMessageData = async () => {
    if (!messageId) return;
    setLoadingData(true);
    try {
      const msg = await adminMessagesApi.getById(messageId);
      setTitle(msg.title);
      setBody(msg.body || '');
      setMessageType(msg.type);
      setPublishAt(msg.publish_at || '');
      setExpireAt(msg.expire_at || '');

      const rules = msg.audience_rules || {};
      if (rules.min_age || rules.max_age) {
        setAllAges(false);
        setMinAge(rules.min_age ?? 18);
        setMaxAge(rules.max_age ?? 100);
      }
      if (rules.regions) setSelectedRegions(rules.regions);
      if (rules.gender) setGender(rules.gender);
    } catch (error) {
      console.error('Failed to load message:', error);
      alert('Failed to load message');
      navigate('/messages');
    } finally {
      setLoadingData(false);
    }
  };

  const buildAudienceRules = () => {
    const rules: Record<string, any> = {};
    if (!allAges) {
      rules.min_age = minAge;
      rules.max_age = maxAge;
    }
    if (selectedRegions.length > 0) rules.regions = selectedRegions;
    if (gender !== 'all') rules.gender = gender;
    return rules;
  };

  const canSave = title.trim().length > 0;

  const handleSaveDraft = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        title,
        body,
        type: messageType,
        audience_rules: buildAudienceRules(),
        publish_at: publishAt || undefined,
        expire_at: expireAt || undefined,
      };

      if (isEditing) {
        await adminMessagesApi.update(messageId!, payload);
      } else {
        await adminMessagesApi.create(payload);
      }
      navigate('/messages');
    } catch (error) {
      console.error('Failed to save message:', error);
      alert('Failed to save message');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!canSave) return;
    setPublishing(true);
    try {
      let id = messageId;
      const payload = {
        title,
        body,
        type: messageType,
        audience_rules: buildAudienceRules(),
        publish_at: publishAt || undefined,
        expire_at: expireAt || undefined,
      };

      if (!isEditing) {
        const created = await adminMessagesApi.create(payload);
        id = created.id;
      } else {
        await adminMessagesApi.update(messageId!, payload);
      }

      await adminMessagesApi.publish(id!);
      navigate('/messages');
    } catch (error) {
      console.error('Failed to publish message:', error);
      alert('Failed to publish message');
    } finally {
      setPublishing(false);
    }
  };

  if (loadingData) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Message' : 'Create Message'}
        </h1>
        <p className="text-gray-600 mt-1">
          {isEditing
            ? 'Update your message details'
            : 'Create a new announcement, alert, or reminder'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Form (2/3 width) */}
        <div className="col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Basic Information
            </h2>
            <div className="space-y-4">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter message title"
              />
              <Textarea
                label="Body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message content..."
                rows={6}
              />
              <Select
                label="Type"
                value={messageType}
                onChange={(e) =>
                  setMessageType(e.target.value as MessageType)
                }
                options={[
                  { value: 'announcement', label: 'Announcement' },
                  { value: 'alert', label: 'Alert' },
                  { value: 'reminder', label: 'Reminder' },
                ]}
              />
            </div>
          </Card>

          {/* Schedule */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Schedule
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <DateTimePicker24h
                label="Publish At (optional)"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
              <DateTimePicker24h
                label="Expire At (optional)"
                value={expireAt}
                onChange={(e) => setExpireAt(e.target.value)}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Leave "Publish At" empty to publish immediately when you click
              Publish.
            </p>
          </Card>

          {/* Audience */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Audience
            </h2>
            <div className="space-y-4">
              {/* Age */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <input
                    type="checkbox"
                    checked={allAges}
                    onChange={(e) => setAllAges(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  All Ages
                </label>
                {!allAges && (
                  <div className="flex items-center gap-4 ml-6">
                    <Input
                      type="number"
                      label="Min Age"
                      value={String(minAge)}
                      onChange={(e) => setMinAge(Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      label="Max Age"
                      value={String(maxAge)}
                      onChange={(e) => setMaxAge(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>

              {/* Regions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Regions
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedRegions.map((regionId) => {
                    const region = regions.find((r) => r.id === regionId);
                    return (
                      <span
                        key={regionId}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
                      >
                        {region
                          ? `${region.name_en} / ${region.name_ka}`
                          : regionId}
                        <button
                          onClick={() =>
                            setSelectedRegions(
                              selectedRegions.filter((r) => r !== regionId)
                            )
                          }
                          className="ml-1.5 text-primary-600 hover:text-primary-800"
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                </div>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !selectedRegions.includes(val)) {
                      setSelectedRegions([...selectedRegions, val]);
                    }
                  }}
                >
                  <option value="">Select region...</option>
                  {regions
                    .filter((r) => !selectedRegions.includes(r.id))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name_en} / {r.name_ka}
                      </option>
                    ))}
                </select>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gender
                </label>
                <div className="flex gap-4">
                  {(['all', 'M', 'F'] as const).map((val) => (
                    <label key={val} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="gender"
                        checked={gender === val}
                        onChange={() => setGender(val)}
                        className="text-primary-600"
                      />
                      <span className="text-sm text-gray-700">
                        {val === 'all' ? 'All' : val === 'M' ? 'Men' : 'Women'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={!canSave || saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Save Draft
            </Button>
            <Button
              onClick={handlePublish}
              disabled={!canSave || publishing}
            >
              {publishing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {publishAt ? 'Schedule' : 'Publish Now'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/messages')}>
              Cancel
            </Button>
          </div>
        </div>

        {/* Right: Preview (1/3 width) */}
        <div className="col-span-1">
          <div className="sticky top-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Preview
                </h2>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" />
                  {showPreview ? 'Hide' : 'Show'}
                </button>
              </div>
              {showPreview ? (
                <MessagePreview
                  title={title}
                  body={body}
                  type={messageType}
                  publishAt={publishAt}
                  expireAt={expireAt}
                />
              ) : (
                <p className="text-sm text-gray-500">
                  Click "Show" to see a mobile card preview of your message.
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
