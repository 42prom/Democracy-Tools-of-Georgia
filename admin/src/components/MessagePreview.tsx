import { Bell, AlertTriangle, Clock } from 'lucide-react';
import type { MessageType } from '../types';

interface MessagePreviewProps {
  title: string;
  body: string;
  type: MessageType;
  publishAt?: string;
  expireAt?: string;
}

const TYPE_CONFIG: Record<
  MessageType,
  { icon: typeof Bell; color: string; bg: string; label: string }
> = {
  announcement: {
    icon: Bell,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    label: 'Announcement',
  },
  alert: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    label: 'Alert',
  },
  reminder: {
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    label: 'Reminder',
  },
};

export default function MessagePreview({
  title,
  body,
  type,
  publishAt,
  expireAt,
}: MessagePreviewProps) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.announcement;
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {/* Mobile card preview */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {/* Type header stripe */}
        <div className={`${config.bg} px-4 py-2 flex items-center gap-2`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
          <span className={`text-xs font-semibold ${config.color}`}>
            {config.label}
          </span>
        </div>

        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {title || 'Untitled Message'}
          </h3>
          {body ? (
            <p className="text-xs text-gray-600 mt-1 line-clamp-3">{body}</p>
          ) : (
            <p className="text-xs text-gray-400 mt-1 italic">No content yet</p>
          )}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
            {publishAt && (
              <span>
                {new Date(publishAt).toLocaleDateString()}{' '}
                {new Date(publishAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            {expireAt && <span>Expires {new Date(expireAt).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      {/* Detail preview */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Detail View
          </span>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            <span className={`text-xs font-semibold ${config.color}`}>
              {config.label}
            </span>
          </div>
          <h3 className="text-base font-bold text-gray-900">
            {title || 'Untitled Message'}
          </h3>
          {body ? (
            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
              {body}
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-2 italic">
              Message body will appear here...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
