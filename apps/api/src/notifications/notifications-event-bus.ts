import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

/**
 * A notification event pushed via SSE to a user's browser.
 */
export interface NotificationEvent {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  actionUrl?: string;
  objectType?: string;
  objectId?: string;
  createdAt: Date;
}

/**
 * NotificationsEventBus — in-memory pub/sub for real-time SSE delivery.
 *
 * Each connected user gets a Subject subscribed to events filtered by
 * their userId. When a notification is created, it's pushed to the
 * user's Subject, which the SSE endpoint is observing.
 *
 * NOTE: This is in-memory only — works for a single API instance. For
 * multi-instance deployments, replace with Redis pub/sub (BullMQ
 * already provides the infrastructure for this — Phase 8 will wire it).
 */
@Injectable()
export class NotificationsEventBus {
  private readonly logger = new Logger(NotificationsEventBus.name);
  private readonly userSubjects = new Map<string, Subject<NotificationEvent>>();

  /**
   * Publish a notification event to the user's stream.
   * If the user has no active SSE connection, the event is silently
   * dropped (the persisted Notification row remains for polling).
   */
  publish(event: NotificationEvent): void {
    const subject = this.userSubjects.get(event.userId);
    if (!subject) {
      this.logger.debug(
        `No active SSE for user ${event.userId} — event will be polled later`,
      );
      return;
    }
    subject.next(event);
  }

  /**
   * Subscribe to a user's notification stream. Used by the SSE endpoint.
   * Returns an Observable that emits events for this user only.
   */
  subscribe(userId: string): Observable<NotificationEvent> {
    let subject = this.userSubjects.get(userId);
    if (!subject) {
      subject = new Subject<NotificationEvent>();
      this.userSubjects.set(userId, subject);
      this.logger.debug(`Created SSE stream for user ${userId}`);
    }
    // Filter is technically redundant (we only publish to this user's subject)
    // but it's a safety net against any future broadcast bugs.
    return subject.asObservable().pipe(filter((e) => e.userId === userId));
  }

  /**
   * Unsubscribe a user's stream. Called when the SSE connection closes.
   * Cleans up the Subject to prevent memory leaks.
   */
  unsubscribe(userId: string): void {
    const subject = this.userSubjects.get(userId);
    if (subject) {
      subject.complete();
      this.userSubjects.delete(userId);
      this.logger.debug(`Closed SSE stream for user ${userId}`);
    }
  }

  /**
   * Get the count of active SSE connections (for monitoring).
   */
  getActiveConnectionCount(): number {
    return this.userSubjects.size;
  }
}
