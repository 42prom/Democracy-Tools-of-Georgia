import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Send,
  Archive,
  Search,
  Bell,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminMessagesApi } from '../api/client';
import type { Message, MessageStatus } from '../types';

const STATUS_TABS: { label: string; value: MessageStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
];

const TYPE_ICONS: Record<string, typeof Bell> = {
  announcement: Bell,
  alert: AlertTriangle,
  reminder: Clock,
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-yellow-100 text-yellow-800',
};

export default function MessagesList() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MessageStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadMessages();
  }, [activeTab]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const data = await adminMessagesApi.list(
        activeTab === 'all' ? undefined : activeTab
      );
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (id: string) => {
    if (!confirm('Are you sure you want to publish this message?')) return;
    try {
      await adminMessagesApi.publish(id);
      loadMessages();
    } catch (error) {
      console.error('Failed to publish message:', error);
      alert('Failed to publish message');
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Are you sure you want to archive this message?')) return;
    try {
      await adminMessagesApi.archive(id);
      loadMessages();
    } catch (error) {
      console.error('Failed to archive message:', error);
      alert('Failed to archive message');
    }
  };

  const filtered = searchQuery
    ? messages.filter((m) =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-1">
            Create and manage announcements, alerts, and reminders
          </p>
        </div>
        <Button onClick={() => navigate('/messages/create')}>
          <Plus className="w-4 h-4 mr-2" />
          New Message
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex space-x-6">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            No messages found
          </h2>
          <p className="text-gray-600 text-center max-w-md">
            {searchQuery
              ? 'No messages match your search.'
              : 'Create a new message to get started.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((msg) => {
            const TypeIcon = TYPE_ICONS[msg.type] || Bell;
            return (
              <Card key={msg.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="mt-0.5">
                      <TypeIcon className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {msg.title}
                      </h3>
                      {msg.body && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {msg.body}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_BADGE[msg.status] || STATUS_BADGE.draft
                          }`}
                        >
                          {msg.status}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {msg.type}
                        </span>
                        <span className="text-sm text-gray-500">
                          Created{' '}
                          {new Date(msg.created_at).toLocaleDateString()}
                        </span>
                        {msg.publish_at && (
                          <span className="text-sm text-gray-500">
                            Publishes{' '}
                            {new Date(msg.publish_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {(msg.status === 'draft' || msg.status === 'scheduled') && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(`/messages/${msg.id}/edit`)
                          }
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handlePublish(msg.id)}
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Publish
                        </Button>
                      </>
                    )}
                    {msg.status === 'published' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchive(msg.id)}
                      >
                        <Archive className="w-4 h-4 mr-1" />
                        Archive
                      </Button>
                    )}
                    {msg.status === 'draft' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (
                            !confirm(
                              'Are you sure you want to delete this draft?'
                            )
                          )
                            return;
                          try {
                            await adminMessagesApi.update(msg.id, {
                              status: 'archived',
                            });
                            loadMessages();
                          } catch {
                            alert('Failed to delete');
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
