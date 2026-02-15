import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ticket,
  MessageCircle,
  Clock,
  CheckCircle,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  Inbox,
} from 'lucide-react';
import Card from '../components/ui/Card';
import { ticketsApi, type Ticket as TicketType, type TicketStats } from '../api/client';
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
  waiting_user: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function Tickets() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadTickets();
  }, [page, statusFilter, priorityFilter, searchQuery]);

  const loadStats = async () => {
    try {
      const data = await ticketsApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load ticket stats:', error);
    }
  };

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await ticketsApi.list({
        page,
        pageSize: 20,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        search: searchQuery || undefined,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });
      setTickets(data.tickets);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('Failed to load tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-600 mt-1">Manage user support requests</p>
        </div>
        <button
          onClick={() => { loadStats(); loadTickets(); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Inbox className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.open}</p>
                <p className="text-xs text-gray-500">Open</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.inProgress}</p>
                <p className="text-xs text-gray-500">In Progress</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageCircle className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.waitingUser}</p>
                <p className="text-xs text-gray-500">Waiting</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.resolved}</p>
                <p className="text-xs text-gray-500">Resolved</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Ticket className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_user">Waiting for User</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {(statusFilter || priorityFilter || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('');
                setPriorityFilter('');
                setSearchQuery('');
                setPage(1);
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* Tickets List */}
      <Card>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No tickets found</h3>
            <p className="text-gray-500 mt-1">
              {searchQuery || statusFilter || priorityFilter
                ? 'Try adjusting your filters'
                : 'No support tickets have been submitted yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-gray-500">
                        #{ticket.ticketNumber}
                      </span>
                      <span
                        className={clsx(
                          'px-2 py-0.5 text-xs font-medium rounded-full border',
                          statusColors[ticket.status]?.bg,
                          statusColors[ticket.status]?.text,
                          statusColors[ticket.status]?.border
                        )}
                      >
                        {statusLabels[ticket.status]}
                      </span>
                      <span
                        className={clsx(
                          'px-2 py-0.5 text-xs font-medium rounded',
                          priorityColors[ticket.priority]?.bg,
                          priorityColors[ticket.priority]?.text
                        )}
                      >
                        {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 truncate">
                      {ticket.subject}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span>{ticket.userName || 'Anonymous'}</span>
                      <span>•</span>
                      <span className="capitalize">{ticket.category}</span>
                      <span>•</span>
                      <span>{formatDate(ticket.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
