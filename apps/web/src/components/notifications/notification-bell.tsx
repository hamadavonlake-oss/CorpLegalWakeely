'use client';

import { useState, useEffect, useRef } from 'react';
import { useApi } from '@/lib/use-api';
import { api, getAccessToken } from '@/lib/api-client';
import Link from 'next/link';
import { useLocale } from 'next-intl';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  actionUrl?: string;
  readAt?: string;
  createdAt: string;
}

interface UnreadCount {
  unread: number;
  total: number;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function NotificationBell() {
  const locale = useLocale();
  const { data: countData, mutate: mutateCount } = useApi<UnreadCount>('/notifications/unread-count');
  const { data: notifData, mutate: mutateList } = useApi<{ data: Notification[] }>(
    '/notifications?limit=10',
  );

  const [open, setOpen] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Connect to SSE for real-time notifications
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    // EventSource doesn't support custom headers, so we pass the token as a query param
    // The backend should accept this as a fallback (or we use a different SSE auth method)
    // For MVP, we'll poll as a fallback if SSE fails
    try {
      const es = new EventSource(`${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`);

      es.addEventListener('notification', (event) => {
        try {
          const data = JSON.parse(event.data);
          // Show a brief browser notification (if permitted)
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(data.title, { body: data.body });
          }
          // Refresh the unread count + list
          mutateCount();
          mutateList();
        } catch {
          // Ignore parse errors
        }
      });

      es.addEventListener('heartbeat', () => {
        // Heartbeat keeps the connection alive — no action needed
      });

      es.onerror = () => {
        // SSE error — will auto-reconnect. As fallback, poll every 30s
      };

      setEventSource(es);
    } catch {
      // SSE not supported — polling fallback below
    }

    // Polling fallback: refresh every 30 seconds
    const pollInterval = setInterval(() => {
      mutateCount();
      mutateList();
    }, 30000);

    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(pollInterval);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unread = countData?.unread ?? 0;
  const notifications = notifData?.data ?? [];

  const handleMarkRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`, {});
      mutateCount();
      mutateList();
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read', {});
      mutateCount();
      mutateList();
    } catch {
      // Ignore
    }
  };

  const severityColor: Record<string, string> = {
    info: 'border-l-blue-500',
    success: 'border-l-[var(--success)]',
    warning: 'border-l-[var(--warning)]',
    error: 'border-l-[var(--destructive)]',
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded p-2 hover:bg-[var(--muted)] transition-colors"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] p-3">
            <span className="font-medium">
              {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            </span>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                {locale === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                {locale === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`border-l-2 ${severityColor[n.severity] ?? 'border-l-blue-500'} border-b border-[var(--border)] p-3 last:border-0 hover:bg-[var(--muted)] transition-colors ${!n.readAt ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="mt-0.5 text-sm text-[var(--muted-foreground)] line-clamp-2">{n.body}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!n.readAt && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="text-xs text-[var(--primary)] hover:underline whitespace-nowrap"
                      >
                        {locale === 'ar' ? 'مقروء' : 'Read'}
                      </button>
                    )}
                  </div>
                  {n.actionUrl && (
                    <Link
                      href={n.actionUrl}
                      onClick={() => setOpen(false)}
                      className="mt-1 inline-block text-xs text-[var(--primary)] hover:underline"
                    >
                      {locale === 'ar' ? 'عرض ←' : 'View →'}
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-[var(--border)] p-2 text-center">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                {locale === 'ar' ? 'عرض الكل' : 'View all'}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
