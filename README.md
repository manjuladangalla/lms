# LMS — Learning Management System

Full-stack LMS: **FastAPI + MongoDB + Redis** backend, **React (Vite + TypeScript + Tailwind)** frontend, **Docker** deployment.

## Features

- **Public site**: Home, About, Classes, Courses, Diploma, Memberships, **Counselling**, Contact, Certificate Verification
- **3 switchable UI templates**: **Normal** (indigo), **Light** (clean minimal), **Dark** — persisted per user (localStorage + profile sync via `/auth/theme`)
- **Admin-editable institute identity**: site name, logo, favicon, tagline, hero, contact details (Admin → Institute Settings)
- **Course & class management**: programmes (class/course/diploma), subjects, lessons, study materials (course/module/lesson scope), enrolment, access control — plus a public **intro video** per programme (YouTube URL or upload, watchable without login/payment)
- **Flexible pricing**: one-time (lifetime), time-limited access (weekly / monthly / semester = 4 months / yearly), per module, or per lesson — scope purchases unlock permanently (see *Pricing modes*). **Currency is set per course** (and per membership plan) from the institute's currency list
- **Scheduling**: optional lesson/module start & due dates (🔒 before start, overdue badge after due) and recurring live classes (daily/weekly/monthly, materialized occurrences with shared Zoom link)
- **Progress tracking**: lesson completion, course %, student dashboard
- **Exams**: MCQ, true/false, fill-blank, ordering (auto-graded) + essay/short-answer (manual grading queue), attempts, pass marks, results history — plus **answer-paper mode** (upload paper file, graded manually against total marks)
- **Memberships & payments**: PayPal + manual bank transfer with proof upload and admin verification; access activated on approval — plus **4 discount membership plans** (25/50/75/100% off every course fee, billed monthly or yearly)
- **Promo codes**: time-limited discounts (window, max uses, all-courses or single-course scope) that **stack on top of** the membership discount, applied live at checkout
- **Colourful home banners**: admin-managed carousel (gradient themes + optional image, CTA link) on the homepage
- **Counselling & session booking**: counsellors define **repeating weekly sessions** (one session length, then the days it repeats on with start time and sessions per day - e.g. *every Monday, 5 × 1 hr*) and anyone — **including guests with no account** — books one of the free slots from the public `/counselling` page (calendar date picker, all sessions of the date shown with taken ones disabled); **once a slot is booked it is unavailable to everybody else**
- **Real-time updates**: Redis → WebSocket (`/api/v1/ws`) pushes payment/enrolment/membership/promo/banner/programme/live events to dashboards and the public site without refresh
- **Course ownership**: courses are editable only by the admin or the lecturer who created them (other lecturers get 403)
- **Digital certificates**: unique cert number, embedded QR + PDF, public `/verify/:certNo` page with grade — two print modes:
  - **System-generated** designed PDF, and
  - **Pre-printed fill-in** PDF: admin positions each field (drag designer) to line up with physical pre-printed paper; staff can edit student/course details per certificate and regenerate
- **Zoom live classes**: schedule per programme (auto-create Zoom meeting or paste manual link), optionally **linked to a lesson**, with **class list** (payment status + manual block/unblock) — join URL only returned to enrolled, entitled students (or staff)
- **Roles**: admin, lecturer, **counsellor**, student · JWT + refresh (Redis) + optional Google OAuth · **phone number required when registering** (`POST /auth/register` rejects a missing/short phone with `422`)
  - **Admin**: users, payment verification, system config, institute settings, CMS, certificates
  - **Lecturer**: programmes (classes/courses/diplomas), modules, lessons, exams, assignments, grading, live classes, certificates
  - **Counsellor**: weekly counselling schedule, bookings (mark attended/cancelled), counselling dashboard — no course or payment access
  - **Student**: enrol, lessons, exams, results, certificates
- **Redis cache** for settings, catalogue, pages, verify lookups

## Quick start (Docker)

```bash
cp .env.example .env        # edit JWT_SECRET at minimum
docker compose up --build
```

| Service | URL |
|---------|-----|
| Website | http://localhost:8080 |
| API | http://localhost:8000 |
| Swagger | http://localhost:8000/api/docs |

**Default accounts** (seeded): `admin@example.com` / `Admin@123` · `lecturer@example.com` / `Lecturer@123` (change after first login).

Seed (demo programmes, membership plan, pages) runs automatically on container start.

## Production deployment (DigitalOcean droplet)

`.env` is optional and everything is served over HTTPS by Caddy:

```bash
curl -fsSL https://get.docker.com | sh          # Docker + compose plugin
git clone https://github.com/manjuladangalla/lms.git /opt/lms && cd /opt/lms
cp .env.example .env                            # then edit - see below
docker compose -f docker-compose.prod.yml up -d --build
```

| Service | URL |
|---------|-----|
| Website | `https://<droplet-ip>` (self-signed until a domain is configured) |
| Health | `https://<droplet-ip>/health` |
| Swagger | `https://<droplet-ip>/api/docs` |

- **Only 80/443 are published** — mongo, redis, api and web are internal to the compose network.
- Set in `.env` before going live:
  ```bash
  JWT_SECRET=<openssl rand -hex 32>   # required - never commit this
  DEBUG=false                         # already the default in prod compose
  DOMAIN=yourdomain.com               # DNS A record -> droplet IP, then
                                      # docker compose -f docker-compose.prod.yml up -d
  ```
- `DOMAIN` controls the certificate: a real domain gets a **Let's Encrypt** certificate automatically; with the default `localhost` the site still works over HTTPS on the droplet IP with a self-signed certificate (browser warning).
- The frontend is built with `VITE_API_URL=/api/v1` (same origin), so no rebuild or config change is needed when the domain/IP changes.
- Firewall: allow only **22, 80, 443** (DigitalOcean Cloud Firewall or `ufw`).
- Configure `SMTP_*`, `PAYPAL_MODE=live`, `GOOGLE_*`, `ZOOM_*` in `.env` when you need e-mail OTP, PayPal, Google sign-in or Zoom — restart with `docker compose -f docker-compose.prod.yml up -d`.
- Backups: daily `mongodump` of the `lms-prod_mongo_data` volume; point storage at S3/R2 (Admin → System → File Storage) so uploads survive rebuilds.

Updates later: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.

## Local development

```bash
# Backend (needs MongoDB + Redis running)
cd backend
uv sync                          # preferred — uses pyproject.toml + uv.lock
# or: pip install -r requirements.txt
uv run python -m app.seed
uv run uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Install [uv](https://docs.astral.sh/uv/):  
`curl -LsSf https://astral.sh/uv/install.sh | sh`  
Windows: `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`

Set `VITE_API_URL=http://localhost:8000/api/v1` in `frontend/.env`.

## Storage (files: logo, proof, QR, PDF)

Two backends, switchable by the super admin at **Admin → System → File Storage**:

- **Local disk** (default) — files saved to `UPLOAD_DIR` (default `uploads/`, a Docker volume) and served at `/media/*` by the API. Zero setup.
- **S3-compatible** — AWS S3, Cloudflare R2 (cheapest: zero egress fees), MinIO, Backblaze B2. Fill endpoint/bucket/keys in the System page (or `S3_*` env vars as defaults).

Use **Test upload** on that page to verify. Without storage configured, uploads return a clear "storage not configured" error.

## System configuration (super admin)

**Admin → System** page — saved values override `.env` defaults; secrets are write-only (leave blank to keep the saved value):

- **File Storage** — local vs S3 backend, directory, bucket/keys/CDN URL
- **Zoom** — S2S OAuth account/client ID + secret, host email (used by Live Classes)
- **Google** — enable "Sign in with Google", client ID/secret
- **Mail Server** — SMTP host/port/user/password/from/TLS, OTP length & expiry, plus **Send test email**

Endpoints: `GET/PUT /api/v1/system/config`, `POST /system/config/test-mail`, `POST /system/config/test-storage` (admin only).

## Zoom live classes

Admin → Programme → **Live Classes** tab:

1. **Auto Zoom** — set `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` (Zoom App Marketplace → Server-to-Server OAuth, scopes `meeting:write:admin` + `user:read:admin`), optional `ZOOM_HOST_EMAIL`. Creating a session calls Zoom and stores `join_url`.
2. **Manual link** — paste any Zoom/Meet URL if you don't have API credentials.

Students see **Join Live Class** in the Learn page/sidebar only when their enrolment is **active** (or they have an active membership). The API returns 403 for non-enrolled users on list and join endpoints.

Extra controls (Programme → Live Classes tab):

- **Related lesson** — link a session to a lesson; students who have not purchased that module/lesson get 403 at join (and no join URL on list).
- **Repeat** — daily/weekly/monthly until a date; occurrences are created in one batch (max 60) sharing one Zoom meeting. Edits/deletes only affect upcoming occurrences; past ones remain history.
- **Class list** — per-student payment status (paid / awaiting verification / expired / not paid), lesson access, and manual **Block/Unblock** (blocked students get 403 at join).
- Lessons can also schedule a live class directly from **Add Lesson** (checkbox → start time/provider).

## Theme templates

Switcher in the navbar (and dashboards): **Normal · Light · Dark**. Themes are CSS-variable driven (`frontend/src/index.css`). For logged-in users the choice is saved to their profile.

## Institute branding

**Admin → Institute Settings**:

- Site name (used in navbar, footer, `document.title`, certificates)
- Logo & favicon (uploaded → stored in S3/R2)
- Tagline, hero text, contact info, social links
- Manual payment instructions, certificate issuer, footer text

## Pricing modes

**Admin → Programme → Settings → Pricing mode:**

| Mode | What is sold | Access |
|------|--------------|--------|
| **One-time** (default) | Whole programme at `price` | Permanent (lifetime) |
| **Time-limited** | `price` per billing interval — **weekly (7d) / monthly (30d) / semester (120d) / yearly (365d)** | Expires after the period; student re-pays to renew (no auto-charge). Renewal reuses the same enrolment (progress kept) and resets the expiry from payment verification |
| **Per module** | Each module has its own `price` | That module unlocks permanently |
| **Per lesson** | Each lesson has its own `price` | That lesson unlocks permanently |

Scope purchases go through the same Free / Manual / PayPal flows — `POST /enrolments` accepts `scope_type` (`programme`/`subject`/`lesson`) + `scope_id`. Students pay per scope only once (repeat buys return the existing enrolment). In Learn, locked-but-unpaid lessons show an **Unlock** button (module/lesson price), and subscriptions show an expiry warning + renew buttons.

Study materials can live at **course, module, or lesson** level; entitlement is checked server-side (course materials for everyone, module/lesson resources only for entitled students, hidden while date-locked).

## Payment flow

1. **Free** → enrolment active immediately
2. **Manual** → student uploads transfer proof → Admin → Payments → *Verify* → access granted
3. **PayPal** → order created → student approves → capture/webhook marks payment succeeded → access granted

Gateway/transaction fees (if any) are charged separately by the payment provider.

## Membership plans (discount tiers)

Plans are **discounts, not all-access passes** — a member still buys each course, but at the plan's discount:

| Plan (seed) | Discount | Monthly | Yearly |
|-------------|----------|---------|--------|
| Basic | 25% off | $5 | $50 |
| Standard | 50% off | $9 | $90 |
| Premium | 75% off | $14 | $140 |
| VIP | 100% off (free) | $19 | $190 |

- **Admin → Membership Plans**: create/edit plans (name, discount %, monthly + yearly price, currency, benefits, status)
- **/memberships**: monthly/yearly billing toggle, PayPal or manual payment → admin verifies → discount active until `expires_at`
- Discount is applied automatically at every checkout (course bundle, module, lesson, renewal) and shown in the live price quote

## Promo codes

- **Admin → Promotions**: code, discount %, start/end dates (time-limited window), scope (**all courses** or **one course**), max uses, active/inactive
- Checkout shows a **live price quote** (`POST /pricing/preview`): base price → membership discount → promo discount → final amount
- Invalid/expired/mis-scoped codes are rejected server-side (`400`) and the quoted price is unchanged
- Usage counter increments when the enrolment is created; seeded code: **WELCOME25** (25% off, all courses)

## Home banners (colourful carousel)

**Admin → Banners**: title, subtitle, CTA text + link, 8 gradient themes (ocean/sunset/violet/…), optional background image, sort order, active toggle. The homepage hero shows an auto-rotating carousel (`GET /banners`, publicly cached, refreshed live via WebSocket).

## Counselling sessions & booking

A separate **counsellor** user level defines **repeating weekly sessions** - one session length (e.g. 1 hr), then the days it repeats on with a start time and how many sessions per day (e.g. *every Monday, 5 × 1 hr from 09:00*) - like a doctor's diary. The public books one of the free slots. **Once a slot is booked it is unavailable to everybody else.**

### Booking wizard (`/counselling`)

1. **Counsellor** - cards from `GET /counselling/counsellors` (name, specialty, bio, weekly pattern, free-slot count, next free time)
2. **Date picker** - `GET /counselling/dates?counsellor_id=` returns the next **60 days** that have sessions, each with `free` and `total`; the month calendar highlights days with free slots, marks full days as `full`, and days without sessions stay disabled
3. **Time** - `GET /counselling/slots?counsellor_id=&date=` expands the weekly rules into that day's concrete sessions; **every session of the date is listed** and taken ones are shown as *Unavailable - already booked* (disabled)
4. **Mode** - **Online (Zoom)** or **In person**, offered according to the rule's mode (`both` / `online` / `in_person`)
5. **Details + confirm** - guest name/email (prefilled when signed in) -> confirmation with a booking reference, the **Zoom join link** (online) or the venue (in person)

A "Next available slots" grid below the wizard (and on the **home page**) jumps straight into booking.

| Where | What |
|-------|------|
| **Public → `/counselling`** | Booking wizard (counsellor → calendar date picker → all sessions of that date, taken ones disabled) + next free slots, live availability, guest booking |
| **Home** | Counselling description section with the next free slots and a booking CTA |
| **Admin → Counselling** | Two-step scheduler: **1. session length & details** → **2. days, start time & sessions per day** (with a live time preview); edit/delete **own** rules, **My profile** (specialty/bio), bookings table with join links, mark *attended* / *cancelled*. Admin: the same across all counsellors |
| **Dashboard → My counselling** | Signed-in users see their bookings (upcoming/past), the Zoom link, and can cancel upcoming ones |
| **Admin → Users** | Create the **Counsellor** role with specialty/bio, or edit an existing counsellor's profile (seeded login: `counsellor@example.com` / `Counsellor@123`) |

### Scheduling a repeating session (counsellor)

1. **Session length & details** - title, description, **session length** (15/20/30/45/60/90 min), mode, seats per slot, price + currency, venue, status
2. **Days & times** - tick the days it repeats on (**Mon…Sun**, any combination), pick a **start time** and **sessions per day** (e.g. 5) -> the end time and every session time are computed and previewed (`09:00 · 10:00 · …`) and saved as **one rule** (`weekdays: [0,1,2,3,4]`)

- Rule fields: title, description, **weekdays** (0-6 list, one rule covers all of them), `start_time` / `end_time` (`HH:MM`), **slot length** (= appointment length), mode, **seats per slot** (1 = one-to-one), price + currency (0 = free), venue, status (`active` / `paused`). Slots outside the rule or in the past are rejected, and overlapping rules on a **shared day** return `409` (changing weekdays/times re-runs the check)
- **Zoom meetings**: an online booking creates one meeting **per booking**; join URL, meeting id and passcode are stored on the booking and shown in the confirmation. Cancelling the booking (or deleting the schedule) deletes the meeting. Needs Zoom Server-to-Server OAuth credentials (**Admin → System → Zoom**); if Zoom is unavailable the booking still succeeds and tells the client the link will be emailed
- Booking rules enforced server-side: the slot must belong to an active rule and be in the future, seats limit (`409` when full), one active booking per email per slot, and `both` rules require an explicit mode (`400`). Cancelling frees the slot immediately; paid sessions are settled offline ("pay at the session")
- Access: `GET /counselling/counsellors`, `/dates`, `/slots`, `/upcoming-slots` are public; `POST /counselling/book` needs **no token** (it attaches `user_id` when a token is sent); schedule CRUD and bookings require `admin` or `counselor` and are **ownership-scoped** (another counsellor gets `403`)
- Live availability and dashboard numbers update via `counselling.changed` / `counselling.booked` realtime events

## Real-time events

`app/events.py` publishes every `emit(channel, event, payload)` to Redis and streams it to connected WebSocket clients at **`/api/v1/ws?token=…`** (anonymous clients get `public` channel events; students add `user:{id}`; staff add `staff`; counsellors join `staff`; admins add `admin`). The frontend `useRealtime()` hook (auto-reconnect + backoff) refreshes dashboards, payment/enrolment tables, the catalogue, banners, counselling sessions and live-class lists the moment something changes.

## Course ownership & currencies

- A programme stores `created_by`; only that lecturer (or any admin) may edit it, its subjects/lessons/materials, exams, assignments, live classes and certificates — other lecturers receive `403`
- Programme lists are scoped server-side (lecturers see their own courses + published ones); dashboards aggregate only owned courses
- **Institute Settings → Available currencies** (e.g. `USD,EUR,GBP,LKR,INR`) feeds the currency selectors on courses and membership plans

## Certificate flow

1. Student completes all lessons (100%) + passes final exam if *final exam required* is set
2. Admin → Certificates → **Issue** → cert number + QR + PDF generated
3. Anyone scans QR or visits `/verify/LMS-2026-000001` to verify validity (revocable)

## Project structure

```
backend/app/
  core/       config, db, redis, security, deps
  models/     pydantic schemas
  routers/    auth, users, site, content, commerce, learning, counselling, dashboard, upload
  services/   cache, storage(S3), paypal, certificates(QR/PDF), grading, progress, pricing
  events.py   Redis pub/sub → WebSocket realtime (/api/v1/ws)
  seed.py     default admin + demo data (plans, banners, promo code, counsellor + repeating weekly rules; migrates legacy single-day rules)
frontend/src/
  components/ UI kit, navbar/footer, theme switcher, live price quote
  pages/      public/, auth/, student/, admin/
  store/      auth + theme contexts
  lib/        api client (auto refresh), types, realtime hook
```

## API docs

- Swagger UI: `http://localhost:8000/api/docs`
- Health: `http://localhost:8000/health`
