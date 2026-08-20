import { NotificationsEventBus, type NotificationEvent } from '../notifications-event-bus';

describe('NotificationsEventBus', () => {
  let bus: NotificationsEventBus;

  beforeEach(() => {
    bus = new NotificationsEventBus();
  });

  afterEach(() => {
    // Clean up any remaining subjects
  });

  const makeEvent = (overrides: Partial<NotificationEvent> = {}): NotificationEvent => ({
    id: 'notif-1',
    userId: 'user-1',
    organizationId: 'org-1',
    type: 'request.submitted',
    title: 'Test Notification',
    body: 'This is a test',
    severity: 'info',
    createdAt: new Date(),
    ...overrides,
  });

  describe('publish + subscribe', () => {
    it('delivers events to subscribers', (done) => {
      const stream = bus.subscribe('user-1');
      stream.subscribe({
        next: (event) => {
          expect(event.id).toBe('notif-1');
          expect(event.title).toBe('Test Notification');
          done();
        },
      });

      bus.publish(makeEvent());
    });

    it('only delivers events for the subscribed user', (done) => {
      const user1Stream = bus.subscribe('user-1');
      const user2Stream = bus.subscribe('user-2');

      let user1Events = 0;
      let user2Events = 0;

      user1Stream.subscribe({ next: () => user1Events++ });
      user2Stream.subscribe({
        next: () => {
          user2Events++;
          // user-2 should only get the event for them
          expect(user1Events).toBe(0);
          expect(user2Events).toBe(1);
          done();
        },
      });

      // Publish to user-2 only
      bus.publish(makeEvent({ userId: 'user-2', id: 'notif-2' }));
    });

    it('silently drops events when no subscriber exists', () => {
      // Should not throw
      expect(() => bus.publish(makeEvent({ userId: 'non-existent' }))).not.toThrow();
    });

    it('delivers multiple events in order', (done) => {
      const stream = bus.subscribe('user-1');
      const received: string[] = [];

      stream.subscribe({
        next: (event) => {
          received.push(event.id);
          if (received.length === 3) {
            expect(received).toEqual(['n-1', 'n-2', 'n-3']);
            done();
          }
        },
      });

      bus.publish(makeEvent({ id: 'n-1' }));
      bus.publish(makeEvent({ id: 'n-2' }));
      bus.publish(makeEvent({ id: 'n-3' }));
    });

    it('supports multiple subscribers for the same user', (done) => {
      let count1 = 0;
      let count2 = 0;

      bus.subscribe('user-1').subscribe({ next: () => count1++ });
      bus.subscribe('user-1').subscribe({
        next: () => {
          count2++;
          expect(count1).toBe(1);
          expect(count2).toBe(1);
          done();
        },
      });

      bus.publish(makeEvent());
    });
  });

  describe('unsubscribe', () => {
    it('completes the stream when unsubscribed', (done) => {
      const stream = bus.subscribe('user-1');

      stream.subscribe({
        complete: () => {
          done();
        },
      });

      bus.unsubscribe('user-1');
    });

    it('no longer delivers events after unsubscribe', (done) => {
      const stream = bus.subscribe('user-1');
      let eventCount = 0;

      stream.subscribe({ next: () => eventCount++ });

      bus.unsubscribe('user-1');

      // Publish after unsubscribe — should not increment
      bus.publish(makeEvent());

      setTimeout(() => {
        expect(eventCount).toBe(0);
        done();
      }, 50);
    });

    it('does nothing when unsubscribing a user with no stream', () => {
      expect(() => bus.unsubscribe('non-existent')).not.toThrow();
    });
  });

  describe('getActiveConnectionCount', () => {
    it('returns 0 when no subscribers', () => {
      expect(bus.getActiveConnectionCount()).toBe(0);
    });

    it('returns 1 after one user subscribes', () => {
      bus.subscribe('user-1');
      expect(bus.getActiveConnectionCount()).toBe(1);
    });

    it('returns the count after multiple users subscribe', () => {
      bus.subscribe('user-1');
      bus.subscribe('user-2');
      bus.subscribe('user-3');
      expect(bus.getActiveConnectionCount()).toBe(3);
    });

    it('decrements after unsubscribe', () => {
      bus.subscribe('user-1');
      bus.subscribe('user-2');
      expect(bus.getActiveConnectionCount()).toBe(2);

      bus.unsubscribe('user-1');
      expect(bus.getActiveConnectionCount()).toBe(1);
    });

    it('does not double-count the same user re-subscribing', () => {
      bus.subscribe('user-1');
      bus.subscribe('user-1'); // re-subscribe
      expect(bus.getActiveConnectionCount()).toBe(1);
    });
  });
});
