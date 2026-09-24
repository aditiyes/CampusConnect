const { randomUUID } = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();

let db;

const withDb = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

const initializeEventStore = (filePath = './data/campus.db') => new Promise((resolve, reject) => {
  try {
    db = new sqlite3.Database(filePath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          capacity INTEGER NOT NULL CHECK(capacity > 0)
        );

        CREATE TABLE IF NOT EXISTS registrations (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(event_id, student_id),
          FOREIGN KEY(event_id) REFERENCES events(id)
        );
      `, (execErr) => {
        if (execErr) {
          reject(execErr);
          return;
        }
        resolve();
      });
    });
  } catch (error) {
    reject(error);
  }
});

const eventOverlaps = (a, b) => {
  const sameDate = a.date === b.date;
  if (!sameDate) return false;
  const startA = new Date(`${a.date}T${a.startTime}:00`);
  const endA = new Date(`${a.date}T${a.endTime}:00`);
  const startB = new Date(`${b.date}T${b.startTime}:00`);
  const endB = new Date(`${b.date}T${b.endTime}:00`);

  return startA < endB && startB < endA;
};

const getEventById = (eventId) => new Promise((resolve, reject) => {
  withDb().get('SELECT * FROM events WHERE id = ?', [eventId], (err, row) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(row || null);
  });
});

const getStudentRegistrations = (studentId) => new Promise((resolve, reject) => {
  withDb().all(
    `SELECT r.event_id, e.name, e.date, e.start_time, e.end_time
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.student_id = ?`,
    [studentId],
    (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    },
  );
});

const getRegisteredCount = (eventId) => new Promise((resolve, reject) => {
  withDb().get(
    'SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?',
    [eventId],
    (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(Number(row?.total || 0));
    },
  );
});

const createEvent = ({ name, date, startTime, endTime, capacity }) => new Promise((resolve, reject) => {
  if (!name || !date || !startTime || !endTime || !Number.isInteger(Number(capacity))) {
    reject(new Error('Event name, date, start time, end time, and valid capacity are required.'));
    return;
  }

  if (startTime >= endTime) {
    reject(new Error('End time must be later than start time.'));
    return;
  }

  const eventId = randomUUID();
  const event = {
    id: eventId,
    name,
    date,
    startTime,
    endTime,
    capacity: Number(capacity),
  };

  withDb().run(
    'INSERT INTO events (id, name, date, start_time, end_time, capacity) VALUES (?, ?, ?, ?, ?, ?)',
    [eventId, name, date, startTime, endTime, Number(capacity)],
    function onInsert(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(event);
    },
  );
});

const listEvents = () => new Promise((resolve, reject) => {
  withDb().all(
    `SELECT e.id, e.name, e.date, e.start_time AS startTime, e.end_time AS endTime, e.capacity,
            COUNT(r.id) AS registeredCount
     FROM events e
     LEFT JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id, e.name, e.date, e.start_time, e.end_time, e.capacity
     ORDER BY e.date, e.start_time`,
    [],
    (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve((rows || []).map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        capacity: Number(row.capacity),
        registeredCount: Number(row.registeredCount || 0),
      })));
    },
  );
});

const createRegistration = async ({ eventId, studentId }) => {
  if (!eventId || !studentId) {
    throw new Error('Event ID and student ID are required.');
  }

  const event = await getEventById(eventId);
  if (!event) {
    throw new Error('Event not found.');
  }

  const existingRegistrations = await getStudentRegistrations(studentId);
  const duplicate = existingRegistrations.some((booking) => booking.event_id === eventId);
  if (duplicate) {
    throw new Error('You are already registered for this event.');
  }

  const currentCount = await getRegisteredCount(eventId);
  if (currentCount >= Number(event.capacity)) {
    throw new Error('This event is full. No seats are available.');
  }

  for (const booking of existingRegistrations) {
    const existingEvent = {
      id: booking.event_id,
      name: booking.name,
      date: booking.date,
      startTime: booking.start_time,
      endTime: booking.end_time,
    };

    const candidateEvent = {
      date: event.date,
      startTime: event.start_time,
      endTime: event.end_time,
    };

    if (eventOverlaps(candidateEvent, existingEvent)) {
      throw new Error(`Schedule conflict: ${existingEvent.name} overlaps with this event.`);
    }
  }

  const registrationId = randomUUID();
  await new Promise((resolve, reject) => {
    withDb().run(
      'INSERT INTO registrations (id, event_id, student_id) VALUES (?, ?, ?)',
      [registrationId, eventId, studentId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  return {
    id: registrationId,
    eventId,
    studentId,
    status: 'confirmed',
  };
};

module.exports = {
  initializeEventStore,
  createEvent,
  listEvents,
  createRegistration,
  getEventById,
  getStudentRegistrations,
  eventOverlaps,
};
