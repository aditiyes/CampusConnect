const express = require('express');
const cors = require('cors');
const { initializeEventStore, createEvent, listEvents, createRegistration, getStudentRegistrations } = require('./src/eventService');

const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initializeEventStore('./data/campus.db').catch((error) => {
  console.error('Failed to initialize SQLite database:', error);
  process.exit(1);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/events', async (_req, res) => {
  try {
    const events = await listEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const event = await createEvent(req.body);
    res.status(201).json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/registrations', async (req, res) => {
  try {
    const registration = await createRegistration(req.body);
    res.status(201).json(registration);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/students/:studentId/registrations', async (req, res) => {
  try {
    const registrations = await getStudentRegistrations(req.params.studentId);
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Campus event system running on http://localhost:${PORT}`);
});
