const apiBase = '/api';

const showMessage = (text, type = 'success') => {
  const el = document.getElementById('message');
  el.textContent = text;
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
};

const formatEventTime = (event) => `${event.date} • ${event.startTime} to ${event.endTime}`;

const renderEvents = (events) => {
  const container = document.getElementById('events');
  if (!events.length) {
    container.innerHTML = '<p>No upcoming events yet.</p>';
    return;
  }

  container.innerHTML = events
    .map((event) => {
      const isFull = event.registeredCount >= event.capacity;
      const statusClass = isFull ? 'full' : 'available';
      const statusText = isFull ? 'Full' : `${event.capacity - event.registeredCount} seats left`;
      return `
        <article class="event-card">
          <div class="event-header">
            <h3>${event.name}</h3>
            <span class="pill">ID: ${event.id.slice(0, 8)}</span>
          </div>
          <div class="meta">
            <div>${formatEventTime(event)}</div>
            <div>Registered: ${event.registeredCount} / ${event.capacity}</div>
          </div>
          <div class="status ${statusClass}">${statusText}</div>
          <button style="margin-top: 12px;" data-event-id="${event.id}" type="button">Register</button>
        </article>
      `;
    })
    .join('');

  document.querySelectorAll('[data-event-id]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector('input[name="eventId"]').value = button.dataset.eventId;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
};

const loadEvents = async () => {
  const events = await fetchJson(`${apiBase}/events`);
  renderEvents(events);
};

const loadStudentSchedule = async (studentId) => {
  const list = document.getElementById('schedule');
  if (!studentId.trim()) {
    list.innerHTML = '<li>Enter a student ID to view schedule</li>';
    return;
  }

  const registrations = await fetchJson(`${apiBase}/students/${encodeURIComponent(studentId)}/registrations`);
  if (!registrations.length) {
    list.innerHTML = '<li>No current registrations.</li>';
    return;
  }

  list.innerHTML = registrations
    .map((event) => `<li><strong>${event.name}</strong> — ${event.date} ${event.start_time} to ${event.end_time}</li>`)
    .join('');
};

document.getElementById('eventForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    await fetchJson(`${apiBase}/events`, {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        capacity: Number(payload.capacity),
      }),
    });
    showMessage('Event created successfully.');
    form.reset();
    await loadEvents();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

document.getElementById('registrationForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    await fetchJson(`${apiBase}/registrations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showMessage('Registration confirmed.');
    form.reset();
    await loadEvents();
    const studentIdInput = document.getElementById('scheduleStudentId');
    if (studentIdInput.value.trim()) {
      await loadStudentSchedule(studentIdInput.value);
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

document.getElementById('loadScheduleButton').addEventListener('click', () => {
  loadStudentSchedule(document.getElementById('scheduleStudentId').value);
});

loadEvents();
