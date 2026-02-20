/**
 * Premium Date Formatting Utilities
 */

/**
 * Formats a date string or Date object into a premium localized 24h format.
 * Includes relative time context for recent items.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Premium relative display for recent items
  if (diffMs > 0 && diffMs < 60000) return 'Just now';
  if (diffMs > 0 && diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  
  // Use Intl for high-quality localized formatting
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  if (diffDays === 0 && d.getDate() === now.getDate()) {
    return `Today, ${timeStr}`;
  }
  
  if (diffDays === 1 || (diffDays === 0 && d.getDate() !== now.getDate())) {
    return `Yesterday, ${timeStr}`;
  }

  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Formats a duration in seconds to a human-readable string.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
