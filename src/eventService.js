const { randomUUID } = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();

let db;

const withDb = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

const normalizeEventDateRange = (payload) => {
  const startDate = payload.startDate || payload.date || payload.start_date || null;
  const endDate = payload.endDate || payload.end_date || startDate || null;
  return { startDate, endDate };
};

const parseEventTime = (event, key) => {
  const value = event[key] ?? event[`${key}Time`] ?? event[`${key}_time`];
  return value || null;
};

const initializeEventStore = (filePath = './data/campus.db') => new Promise((resolve, reject) => {
  try {
    db = new sqlite3.Database(filePath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS venues (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          location TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          date TEXT,
          start_date TEXT,
          end_date TEXT,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          capacity INTEGER NOT NULL CHECK(capacity > 0),
          venue_id TEXT,
          approval_status TEXT NOT NULL DEFAULT 'approved',
          waitlist_enabled INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(venue_id) REFERENCES venues(id)
        );

        CREATE TABLE IF NOT EXISTS registrations (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'confirmed',
          attendance_status TEXT NOT NULL DEFAULT 'pending',
          certificate_eligible INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(event_id, student_id),
          FOREIGN KEY(event_id) REFERENCES events(id)
        );

        CREATE TABLE IF NOT EXISTS waitlist (
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
  const safeDate = (value) => value || a.date || b.date || null;
  const aStartDate = safeDate(a.startDate || a.date);
  const aEndDate = safeDate(a.endDate || a.date);
  const bStartDate = safeDate(b.startDate || b.date);
  const bEndDate = safeDate(b.endDate || b.date);

  const aStart = new Date(`${aStartDate}T${a.startTime}:00`);
  const aEnd = new Date(`${aEndDate}T${a.endTime}:00`);
  const bStart = new Date(`${bStartDate}T${b.startTime}:00`);
  const bEnd = new Date(`${bEndDate}T${b.endTime}:00`);

  return aStart < bEnd && bStart < aEnd;
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
    `SELECT r.id, r.event_id, r.student_id, r.status, r.attendance_status, r.certificate_eligible,
            e.name, e.date, e.start_date, e.end_date, e.start_time, e.end_time,
            e.approval_status, e.venue_id
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.student_id = ?
     ORDER BY e.start_date, e.start_time`,
    [studentId],
    (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve((rows || []).map((row) => ({
        id: row.id,
        event_id: row.event_id,
        eventId: row.event_id,
        student_id: row.student_id,
        studentId: row.student_id,
        status: row.status,
        attendanceStatus: row.attendance_status,
        attendance_status: row.attendance_status,
        certificateEligible: Boolean(row.certificate_eligible),
        certificate_eligible: Boolean(row.certificate_eligible),
        name: row.name,
        date: row.date || row.start_date,
        startDate: row.start_date || row.date,
        endDate: row.end_date || row.date,
        start_time: row.start_time,
        startTime: row.start_time,
        end_time: row.end_time,
        endTime: row.end_time,
        approvalStatus: row.approval_status,
        venueId: row.venue_id,
      })));
    },
  );
});

const getRegisteredCount = (eventId, statusFilter = 'confirmed') => new Promise((resolve, reject) => {
  withDb().get(
    'SELECT COUNT(*) AS total FROM registrations WHERE event_id = ? AND status = ?',
    [eventId, statusFilter],
    (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(Number(row?.total || 0));
    },
  );
});

const getWaitlistEntries = (eventId) => new Promise((resolve, reject) => {
  withDb().all(
    'SELECT * FROM waitlist WHERE event_id = ? ORDER BY created_at ASC',
    [eventId],
    (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    },
  );
});

const createVenue = ({ name, location }) => new Promise((resolve, reject) => {
  if (!name) {
    reject(new Error('Venue name is required.'));
    return;
  }

  const venueId = randomUUID();
  withDb().run(
    'INSERT INTO venues (id, name, location) VALUES (?, ?, ?)',
    [venueId, name, location || ''],
    function onInsert(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: venueId, name, location: location || '' });
    },
  );
});

const createEvent = async ({ name, date, startDate, endDate, startTime, endTime, capacity, venueId, waitlistEnabled, approvalStatus, status, approved }) => {
  const normalizedDateRange = normalizeEventDateRange({ date, startDate, endDate });
  const startOn = normalizedDateRange.startDate || date;
  const endOn = normalizedDateRange.endDate || date;

  if (!name || !startOn || !startTime || !endTime || !Number.isInteger(Number(capacity))) {
    throw new Error('Event name, date, start time, end time, and valid capacity are required.');
  }

  if (endOn && new Date(`${endOn}T00:00:00`) < new Date(`${startOn}T00:00:00`)) {
    throw new Error('Event end date must be later than or equal to start date.');
  }

  if (startTime >= endTime && startOn === endOn) {
    throw new Error('End time must be later than start time.');
  }

  const normalizedWaitlistEnabled = Boolean(waitlistEnabled || (waitlistEnabled === undefined && approved === false));
  const normalizedApprovalStatus = (approvalStatus || status || (approved === false ? 'pending' : 'approved')).toLowerCase();

  const eventId = randomUUID();
  const event = {
    id: eventId,
    name,
    date: startOn,
    startDate: startOn,
    endDate: endOn,
    startTime,
    endTime,
    capacity: Number(capacity),
    venueId: venueId || null,
    approvalStatus: normalizedApprovalStatus,
    waitlistEnabled: Number(normalizedWaitlistEnabled),
  };

  if (event.venueId) {
    const venueRow = await new Promise((resolve, reject) => {
      withDb().get('SELECT * FROM venues WHERE id = ?', [event.venueId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });

    if (!venueRow) {
      throw new Error('Venue not found.');
    }

    const venueConflicts = await new Promise((resolve, reject) => {
      withDb().all(
        'SELECT * FROM events WHERE venue_id = ? AND id != ?',
        [event.venueId, eventId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        },
      );
    });

    const hasVenueConflict = venueConflicts.some((existing) => eventOverlaps({
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      date: event.date,
    }, {
      startDate: existing.start_date || existing.date,
      endDate: existing.end_date || existing.date,
      startTime: existing.start_time,
      endTime: existing.end_time,
      date: existing.date,
    }));

    if (hasVenueConflict) {
      throw new Error('Venue conflict: this venue is already booked during that time.');
    }
  }

  await new Promise((resolve, reject) => {
    withDb().run(
      'INSERT INTO events (id, name, date, start_date, end_date, start_time, end_time, capacity, venue_id, approval_status, waitlist_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [event.id, event.name, event.date, event.startDate, event.endDate, event.startTime, event.endTime, Number(event.capacity), event.venueId, event.approvalStatus, event.waitlistEnabled],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  return event;
};

const listEvents = () => new Promise((resolve, reject) => {
  withDb().all(
    `SELECT e.id, e.name, e.date, e.start_date AS startDate, e.end_date AS endDate,
            e.start_time AS startTime, e.end_time AS endTime, e.capacity,
            e.venue_id AS venueId, e.approval_status AS approvalStatus,
            e.waitlist_enabled AS waitlistEnabled,
            COUNT(r.id) AS registeredCount
     FROM events e
     LEFT JOIN registrations r ON r.event_id = e.id AND r.status = 'confirmed'
     GROUP BY e.id, e.name, e.date, e.start_date, e.end_date, e.start_time, e.end_time,
              e.capacity, e.venue_id, e.approval_status, e.waitlist_enabled
     ORDER BY COALESCE(e.start_date, e.date), e.start_time`,
    [],
    (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve((rows || []).map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date || row.startDate,
        startDate: row.startDate || row.date,
        endDate: row.endDate || row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        capacity: Number(row.capacity),
        venueId: row.venueId,
        approvalStatus: row.approvalStatus,
        waitlistEnabled: Boolean(Number(row.waitlistEnabled)),
        registeredCount: Number(row.registeredCount || 0),
      })));
    },
  );
});

const addToWaitlist = async (eventId, studentId) => {
  const existingWait = await new Promise((resolve, reject) => {
    withDb().get(
      'SELECT * FROM waitlist WHERE event_id = ? AND student_id = ?',
      [eventId, studentId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      },
    );
  });

  if (existingWait) {
    return { eventId, studentId, status: 'waitlisted' };
  }

  const waitlistId = randomUUID();
  await new Promise((resolve, reject) => {
    withDb().run(
      'INSERT INTO waitlist (id, event_id, student_id) VALUES (?, ?, ?)',
      [waitlistId, eventId, studentId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  return { id: waitlistId, eventId, studentId, status: 'waitlisted' };
};

const promoteWaitlist = async (eventId) => {
  const event = await getEventById(eventId);
  const confirmedCount = await getRegisteredCount(eventId, 'confirmed');
  if (!event || confirmedCount >= Number(event.capacity)) {
    return [];
  }

  const nextWaiter = await new Promise((resolve, reject) => {
    withDb().get(
      'SELECT * FROM waitlist WHERE event_id = ? ORDER BY created_at ASC LIMIT 1',
      [eventId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      },
    );
  });

  if (!nextWaiter) {
    return [];
  }

  const promoted = await new Promise((resolve, reject) => {
    withDb().run(
      'INSERT OR IGNORE INTO registrations (id, event_id, student_id, status, attendance_status, certificate_eligible) VALUES (?, ?, ?, "confirmed", "pending", 0)',
      [randomUUID(), eventId, nextWaiter.student_id],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  await new Promise((resolve, reject) => {
    withDb().run(
      'DELETE FROM waitlist WHERE event_id = ? AND student_id = ?',
      [eventId, nextWaiter.student_id],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  return [{ eventId, studentId: nextWaiter.student_id, status: 'confirmed' }];
};

const cancelRegistration = async ({ eventId, studentId }) => {
  if (!eventId || !studentId) {
    throw new Error('Event ID and student ID are required.');
  }

  await new Promise((resolve, reject) => {
    withDb().run(
      'DELETE FROM registrations WHERE event_id = ? AND student_id = ? AND status = "confirmed"',
      [eventId, studentId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  const promoted = await promoteWaitlist(eventId);
  return { eventId, studentId, status: 'cancelled', promoted };
};

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

  const currentCount = await getRegisteredCount(eventId, 'confirmed');
  if (currentCount >= Number(event.capacity)) {
    if (Number(event.waitlist_enabled) === 1) {
      const waitlisted = await addToWaitlist(eventId, studentId);
      return { ...waitlisted, status: 'waitlisted' };
    }
    throw new Error('This event is full. No seats are available.');
  }

  for (const booking of existingRegistrations) {
    const existingEvent = {
      id: booking.event_id,
      name: booking.name,
      date: booking.date || booking.startDate,
      startDate: booking.startDate || booking.date,
      endDate: booking.endDate || booking.date,
      startTime: booking.start_time || booking.startTime,
      endTime: booking.end_time || booking.endTime,
    };

    if (eventOverlaps(
      {
        date: event.date || event.start_date,
        startDate: event.start_date || event.date,
        endDate: event.end_date || event.date,
        startTime: event.start_time,
        endTime: event.end_time,
      },
      existingEvent,
    )) {
      throw new Error(`Schedule conflict: ${existingEvent.name} overlaps with this event.`);
    }
  }

  const registrationId = randomUUID();
  await new Promise((resolve, reject) => {
    withDb().run(
      'INSERT INTO registrations (id, event_id, student_id, status, attendance_status, certificate_eligible) VALUES (?, ?, ?, "confirmed", "pending", 0)',
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

const approveEvent = async (eventId, approvalStatus = 'approved') => {
  const normalized = String(approvalStatus).toLowerCase();
  if (!['approved', 'rejected', 'pending', 'cancelled'].includes(normalized)) {
    throw new Error('Invalid approval status.');
  }

  await new Promise((resolve, reject) => {
    withDb().run(
      'UPDATE events SET approval_status = ? WHERE id = ?',
      [normalized, eventId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  return { eventId, approvalStatus: normalized };
};

const markAttendance = async (eventId, studentId, attendanceStatus = 'present') => {
  const normalized = String(attendanceStatus).toLowerCase();
  if (!['present', 'absent', 'late'].includes(normalized)) {
    throw new Error('Invalid attendance status.');
  }

  const encodedEligible = normalized === 'present' || normalized === 'late' ? 1 : 0;
  await new Promise((resolve, reject) => {
    withDb().run(
      'UPDATE registrations SET attendance_status = ?, certificate_eligible = ? WHERE event_id = ? AND student_id = ?',
      [normalized, encodedEligible, eventId, studentId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  return { eventId, studentId, attendanceStatus: normalized, certificateEligible: Boolean(encodedEligible) };
};

module.exports = {
  initializeEventStore,
  createVenue,
  createEvent,
  listEvents,
  createRegistration,
  cancelRegistration,
  approveEvent,
  markAttendance,
  getEventById,
  getStudentRegistrations,
  getWaitlistEntries,
  eventOverlaps,
};
