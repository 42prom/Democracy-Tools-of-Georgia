import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  User,
  Tag,
  Flag,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Smartphone,
  Lock,
} from 'lucide-react';
import Card from '../components/ui/Card';
import {
  ticketsApi,
  type TicketDetail as TicketDetailType,
  type TicketStatus,
  type TicketPriority,
} from '../api/client';
import { clsx } from 'clsx';

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  open: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  in_progress: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  waiting_user: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  resolved: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  closed: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-gray-100', text: 'text-gray-600' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  urgent: { bg: 'bg-red-100', text: 'text-red-700' },
};

const statusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_user: 'Waiting for User',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [ticketDetail, setTicketDetail] = useState<TicketDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [setStatusOnSend, setSetStatusOnSend] = useState<TicketStatus | ''>('');

  useEffect(() => {
    if (id) {
      loadTicket();
    }
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [ticketDetail?.responses]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadTicket = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await ticketsApi.getById(id);
      setTicketDetail(data);
    } catch (error) {
      console.error('Failed to load ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendResponse = async () => {
    if (!id || !message.trim()) return;

    setSending(true);
    try {
      await ticketsApi.respond(id, message.trim(), {
        isInternalNote,
        setStatus: setStatusOnSend || undefined,
      });
      setMessage('');
      setIsInternalNote(false);
      setSetStatusOnSend('');
      await loadTicket();
    } catch (error) {
      console.error('Failed to send response:', error);
      alert('Failed to send response');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status: TicketStatus) => {
    if (!id) return;
    try {
      await ticketsApi.updateStatus(id, status);
      await loadTicket();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handlePriorityChange = async (priority: TicketPriority) => {
    if (!id) return;
    try {
      await ticketsApi.updatePriority(id, priority);
      await loadTicket();
    } catch (error) {
      console.error('Failed to update priority:', error);
    }
  };

  const handleAssignToMe = async () => {
    if (!id) return;
    try {
      await ticketsApi.assign(id);
      await loadTicket();
    } catch (error) {
      console.error('Failed to assign ticket:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-96 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!ticketDetail) {
    return (
      <div className="p-6">
        <Card className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-medium text-gray-900">Ticket not found</h2>
          <button
            onClick={() => navigate('/tickets')}
            className="mt-4 text-primary-600 hover:text-primary-700"
          >
            Back to tickets
          </button>
        </Card>
      </div>
    );
  }

  const { ticket, responses } = ticketDetail;
  const isClosed = ticket.status === 'closed';

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/tickets')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tickets
        </button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                #{ticket.ticketNumber}
              </h1>
              <span
                className={clsx(
                  'px-3 py-1 text-sm font-medium rounded-full border',
                  statusColors[ticket.status]?.bg,
                  statusColors[ticket.status]?.text,
                  statusColors[ticket.status]?.border
                )}
              >
                {statusLabels[ticket.status]}
              </span>
            </div>
            <h2 className="text-lg text-gray-700 mt-1">{ticket.subject}</h2>
          </div>
          {!ticket.assignedAdminId && !isClosed && (
            <button
              onClick={handleAssignToMe}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Assign to Me
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Messages Column */}
        <div className="col-span-2">
          <Card className="!p-0 flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Original message */}
              <div className="flex justify-end">
                <div className="max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1 justify-end">
                    <span className="text-xs text-gray-500">
                      {formatDate(ticket.createdAt)}
                    </span>
                    <span className="text-sm font-medium text-gray-700">User</span>
                  </div>
                  <div className="bg-gray-100 rounded-lg rounded-tr-sm p-3">
                    <p className="text-gray-800 whitespace-pre-wrap">{ticket.message}</p>
                  </div>
                </div>
              </div>

              {/* Responses */}
              {responses.map((response) => (
                <div
                  key={response.id}
                  className={clsx('flex', response.isAdmin ? 'justify-start' : 'justify-end')}
                >
                  <div className="max-w-[80%]">
                    <div
                      className={clsx(
                        'flex items-center gap-2 mb-1',
                        response.isAdmin ? 'justify-start' : 'justify-end'
                      )}
                    >
                      {response.isAdmin && (
                        <span className="text-sm font-medium text-primary-700">
                          {response.senderName}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatDate(response.createdAt)}
                      </span>
                      {!response.isAdmin && (
                        <span className="text-sm font-medium text-gray-700">User</span>
                      )}
                      {response.isInternalNote && (
                        <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">
                          <Lock className="w-3 h-3" />
                          Internal
                        </span>
                      )}
                    </div>
                    <div
                      className={clsx(
                        'rounded-lg p-3',
                        response.isAdmin
                          ? response.isInternalNote
                            ? 'bg-yellow-50 border border-yellow-200 rounded-tl-sm'
                            : 'bg-primary-50 border border-primary-200 rounded-tl-sm'
                          : 'bg-gray-100 rounded-tr-sm'
                      )}
                    >
                      <p className="text-gray-800 whitespace-pre-wrap">{response.message}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Input */}
            {!isClosed && (
              <div className="border-t border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Lock className="w-4 h-4" />
                    Internal note
                  </label>
                  <select
                    value={setStatusOnSend}
                    onChange={(e) => setSetStatusOnSend(e.target.value as TicketStatus | '')}
                    className="ml-auto text-sm border border-gray-300 rounded-lg px-2 py-1"
                  >
                    <option value="">Keep status</option>
                    <option value="in_progress">Set: In Progress</option>
                    <option value="waiting_user">Set: Waiting for User</option>
                    <option value="resolved">Set: Resolved</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={isInternalNote ? 'Write an internal note...' : 'Type your response...'}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                    rows={3}
                  />
                  <button
                    onClick={handleSendResponse}
                    disabled={!message.trim() || sending}
                    className={clsx(
                      'px-4 py-2 rounded-lg flex items-center gap-2 self-end',
                      isInternalNote
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                        : 'bg-primary-600 hover:bg-primary-700 text-white',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {sending ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    Send
                  </button>
                </div>
              </div>
            )}

            {isClosed && (
              <div className="border-t border-gray-200 p-4 bg-gray-50 text-center text-gray-500">
                <CheckCircle className="w-5 h-5 inline-block mr-2" />
                This ticket is closed
              </div>
            )}
          </Card>
        </div>

        {/* Details Sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <Card>
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Status
            </h3>
            <select
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
              disabled={isClosed}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_user">Waiting for User</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </Card>

          {/* Priority */}
          <Card>
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Flag className="w-4 h-4" />
              Priority
            </h3>
            <div className="flex flex-wrap gap-2">
              {(['low', 'medium', 'high', 'urgent'] as TicketPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePriorityChange(p)}
                  disabled={isClosed}
                  className={clsx(
                    'px-3 py-1 text-sm font-medium rounded-full border transition-colors',
                    ticket.priority === p
                      ? `${priorityColors[p].bg} ${priorityColors[p].text} border-current`
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
                    isClosed && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </Card>

          {/* Details */}
          <Card>
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Details
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Category</dt>
                <dd className="text-gray-900 capitalize">{ticket.category}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900">{formatDate(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Last Updated</dt>
                <dd className="text-gray-900">{formatDate(ticket.updatedAt)}</dd>
              </div>
              {ticket.resolvedAt && (
                <div>
                  <dt className="text-gray-500">Resolved</dt>
                  <dd className="text-gray-900">{formatDate(ticket.resolvedAt)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* User Info */}
          <Card>
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              User Info
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">User ID</dt>
                <dd className="text-gray-900 font-mono text-xs truncate">
                  {ticket.userId || 'Anonymous'}
                </dd>
              </div>
              {ticket.userEmail && (
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="text-gray-900">{ticket.userEmail}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Device Info */}
          {ticket.userDeviceInfo && (
            <Card>
              <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Device Info
              </h3>
              <dl className="space-y-2 text-sm">
                {Object.entries(ticket.userDeviceInfo).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-gray-500 capitalize">{key}</dt>
                    <dd className="text-gray-900 truncate">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
