import { expect, test } from 'bun:test';
import { Delivery, type DeliveryState } from '../src/web/ui/Delivery';

test('missing acknowledgement becomes unconfirmed and a late acknowledgement still recovers', async () => {
  const changed = Promise.withResolvers<void>(), states: DeliveryState[] = [];
  const delivery = new Delivery(state => { states.push(state); changed.resolve(); }, 5);
  await changed.promise;
  expect(delivery.state).toBe('unconfirmed'); expect(states).toEqual(['unconfirmed']);
  delivery.accept(); expect(delivery.state).toBe('accepted');
  delivery.unconfirmed(); expect(states).toEqual(['unconfirmed', 'accepted']);
});

test('acknowledgement cancels the deadline and does not turn a sent message back into sending', async () => {
  const states: DeliveryState[] = [], delivery = new Delivery(state => states.push(state), 5);
  delivery.accept(); await new Promise(resolve => setTimeout(resolve, 10));
  expect(delivery.state).toBe('accepted'); expect(states).toEqual(['accepted']);
});
