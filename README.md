# Campus Event Management System

A lightweight full-stack app for publishing campus events and registering students while enforcing live seat capacity and schedule conflict checks.

## Features

- Create events with name, date, time range, and seat capacity
- View upcoming events and real-time registration counts
- Register students for events only if seats remain
- Prevent duplicate registrations for the same student/event
- Reject overlapping schedules on the same date using the required time logic
- Enforce boundary-safe conflict logic: events that end exactly when another starts are allowed

## Tech Stack

- Backend: Node.js + Express
- Database: SQLite
- Frontend: Static HTML/CSS/JavaScript
- Testing: Node.js built-in test runner

## Project Structure

- `server.js` — Express server and API routes
- `src/eventService.js` — database access, seat counting, and conflict validation
- `public/` — front-end assets
- `test/event-system.test.js` — functional verification tests
- `data/` — SQLite database storage

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open the app in a browser at:
   ```text
   http://localhost:3000
   ```

## Environment Variables

This project uses the following environment variables:

- `PORT` — Port for the Express API. Defaults to `3000`.

## API Endpoints

### GET /health
Returns application health status.

### GET /api/events
Returns all events with seat counts.

### POST /api/events
Creates a new event.

Request payload:
```json
{
  "name": "AI Workshop",
  "date": "2026-10-04",
  "startTime": "09:00",
  "endTime": "12:00",
  "capacity": 30
}
```

### POST /api/registrations
Registers a student for an event.

Request payload:
```json
{
  "eventId": "<event-id>",
  "studentId": "student-001"
}
```

### GET /api/students/:studentId/registrations
Returns all events currently registered by a specific student.

## Schema Models

### Event
```json
{
  "id": "uuid",
  "name": "string",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "capacity": 25
}
```

### Registration
```json
{
  "id": "uuid",
  "eventId": "uuid",
  "studentId": "string",
  "createdAt": "timestamp"
}
```

## Business Rules and Edge Cases

- Capacity is enforced using confirmed registration records.
- Duplicate registration for the same student and event is rejected.
- Overlap detection uses the rule:
  ```text
  eventA.start < eventB.end && eventB.start < eventA.end
  ```
  on the same date.
- Boundary times are valid and not considered conflicts.
- End time earlier than start time is rejected for event creation.
- If an event reaches capacity, remaining registrations are blocked.

## Test Verification

Run the test suite with:
```bash
npm test
```

## Demo Information

This project is designed to run locally and has no authentication requirement by default. The reviewer can test by opening the root page and creating events and registrations directly.
