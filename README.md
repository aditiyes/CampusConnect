# CampusConnect – Smart Campus Event Management System

CampusConnect is a full-stack MERN application for managing campus events. It enables administrators to create and manage events, while students can browse events, register, join waitlists, and manage their personal event schedules.

The key feature of the system is **schedule-clash prevention**. A student cannot register for two events that overlap in date and time. The system also supports event capacity tracking and automatic waitlist promotion when a confirmed student cancels.

---

## Live Features

### Admin Features

- Secure admin login using JWT authentication
- Create new campus events
- Edit event information
- Delete or cancel events
- View all created events
- View confirmed, waitlisted, and cancelled registrations
- View total students, total events, and registration statistics
- View events that are close to full capacity
- Monitor remaining seats for every event

### Student Features

- Student registration and login
- Browse all upcoming campus events
- Search events by title
- Filter events by category, venue, and date
- View full event information
- Register for an event
- Join a waitlist if an event is full
- View personal registered events in **My Events**
- Cancel a future event registration
- View registration status:
  - Confirmed
  - Waitlisted
  - Cancelled
- Receive clear messages when an event is full or clashes with an already registered event

---

## Unique Features

### 1. Live Event Capacity Tracking

Every event has a maximum capacity.

The application calculates available seats using:

```text
Remaining Seats = Event Capacity - Confirmed Registrations
```

Students can register only while seats are available. When all seats are filled, the system provides a **Join Waitlist** option.

### 2. Schedule Clash Prevention

Before confirming a registration, the system checks whether the student already has another confirmed event during the same time period.

Two events clash when:

```text
newEvent.startDateTime < existingEvent.endDateTime
AND
newEvent.endDateTime > existingEvent.startDateTime
```

Example:

```text
Existing event:
React Development Workshop
10:00 AM to 12:00 PM

New event:
AI and Machine Learning Seminar
11:00 AM to 1:00 PM

Result:
Registration rejected because both events overlap between 11:00 AM and
