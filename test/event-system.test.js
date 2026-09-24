const test = require('node:test');
const assert = require('node:assert/strict');

const { createEvent, createRegistration, listEvents, initializeEventStore } = require('../src/eventService');

const resetStore = async () => {
  await initializeEventStore(':memory:');
};

test('should create an event and count registrations', async () => {
  await resetStore();

  const event = await createEvent({
    name: 'Hackathon',
    date: '2026-10-04',
    startTime: '09:00',
    endTime: '12:00',
    capacity: 3,
  });

  const list = await listEvents();
  assert.equal(list.length, 1);
  assert.equal(list[0].registeredCount, 0);
  assert.equal(list[0].capacity, 3);
  assert.equal(event.name, 'Hackathon');
});

test('should reject duplicate registration for the same student and event', async () => {
  await resetStore();

  const event = await createEvent({
    name: 'Seminar',
    date: '2026-10-05',
    startTime: '10:00',
    endTime: '11:00',
    capacity: 5,
  });

  await createRegistration({ eventId: event.id, studentId: 's1' });
  await assert.rejects(
    () => createRegistration({ eventId: event.id, studentId: 's1' }),
    /already registered/i,
  );
});

test('should reject event registration when the student already has an overlapping event', async () => {
  await resetStore();

  const first = await createEvent({
    name: 'AI Workshop',
    date: '2026-10-06',
    startTime: '10:00',
    endTime: '11:00',
    capacity: 10,
  });

  const second = await createEvent({
    name: 'Design Sprint',
    date: '2026-10-06',
    startTime: '10:59',
    endTime: '12:00',
    capacity: 10,
  });

  await createRegistration({ eventId: first.id, studentId: 's2' });
  await assert.rejects(
    () => createRegistration({ eventId: second.id, studentId: 's2' }),
    /overlap|conflict/i,
  );
});

test('should allow boundary-touching events without conflict', async () => {
  await resetStore();

  const first = await createEvent({
    name: 'Morning Session',
    date: '2026-10-07',
    startTime: '10:00',
    endTime: '11:00',
    capacity: 10,
  });

  const second = await createEvent({
    name: 'Afternoon Session',
    date: '2026-10-07',
    startTime: '11:00',
    endTime: '12:00',
    capacity: 10,
  });

  await createRegistration({ eventId: first.id, studentId: 's3' });
  await assert.doesNotReject(() => createRegistration({ eventId: second.id, studentId: 's3' }));
});

test('should reject registration when the event is full', async () => {
  await resetStore();

  const event = await createEvent({
    name: 'Limited Seats',
    date: '2026-10-08',
    startTime: '13:00',
    endTime: '14:00',
    capacity: 1,
  });

  await createRegistration({ eventId: event.id, studentId: 's4' });
  await assert.rejects(
    () => createRegistration({ eventId: event.id, studentId: 's5' }),
    /full|capacity/i,
  );
});

test('should reject event creation when end time is earlier than start time', async () => {
  await resetStore();

  await assert.rejects(
    () => createEvent({
      name: 'Invalid Timing',
      date: '2026-10-09',
      startTime: '15:00',
      endTime: '14:00',
      capacity: 2,
    }),
    /end time must be later than start time/i,
  );
});
