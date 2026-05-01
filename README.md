# Legal Intake System - Kanzlei Tieben

A complete intake management system for Rechtsanwalt Tieben, combining an AI-powered chatbot widget, automated email intake, an admin dashboard, and Kleos case management integration.

(c) 2026 Legal Intake System -- developed by Rechtsanwalt Tieben


## Overview

The system accepts legal inquiries through two channels:

1. **Chatbot Widget** -- an embeddable JavaScript widget placed on the law firm's website. It guides potential clients through a structured conversation flow, collects case details, uploads documents, and captures contact information with GDPR consent.

2. **Email Intake** -- monitors an inbox via IMAP and uses OpenAI (GPT-5) to automatically parse incoming emails, extract contact data, classify the legal area and topic, and save attachments.

All inquiries land in the **Admin Dashboard**, where they can be reviewed, managed, and exported to **Kleos** (the firm's case management software) via API.


## Architecture

```
WordPress / Website
    |
    |  <script src="https://your-server/widget/chatbot.js"></script>
    v
+-------------------+
| Chatbot Widget    |  (JavaScript, runs in visitor's browser)
+-------------------+
    |
    | REST API calls
    v
+-------------------+       +-------------------+
| Backend (Node.js) | <---> | PostgreSQL        |
| Express + TS      |       | (Docker volume)   |
+-------------------+       +-------------------+
    |         |
    |         +--> Kleos API (OAuth2 Client Credentials)
    |
    +--> IMAP (Gmail / any provider)
    +--> OpenAI API (email parsing)

+-------------------+
| Admin Dashboard   |  (Static HTML/CSS/JS, served by Nginx)
| login-protected   |
+-------------------+
    |
    | REST API calls (JWT auth)
    v
    Backend API
```

**Key points:**
- The chatbot widget is a standalone JS file. It does NOT run inside WordPress -- WordPress just loads it via a script tag.
- The admin dashboard is a separate web application, accessed at its own URL. It is NOT part of WordPress.
- The backend serves both the chatbot API and the admin API.
- All three services (backend, frontend/admin, PostgreSQL) run in Docker containers via Docker Compose.


## Tech Stack

- **Backend**: Node.js 18, TypeScript, Express
- **Database**: PostgreSQL 15
- **Frontend (Admin)**: Vanilla HTML, CSS, JavaScript
- **Chatbot Widget**: Vanilla JavaScript (single file, no dependencies)
- **AI**: OpenAI GPT-5 (for email text parsing and classification)
- **Email**: IMAP polling (works with Gmail, Google Workspace, or any IMAP provider)
- **Case Management**: Kleos API (OAuth2, REST)
- **Containerization**: Docker, Docker Compose
- **Web Server**: Nginx (serves admin panel, proxies API)


## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── api/routes/         # Express route handlers (chatbot, admin, email)
│   │   ├── config/             # Chatbot flow definition (chatbot-flow.json)
│   │   ├── database/           # DB connection, schema, migrations
│   │   ├── middleware/         # Error handler, admin auth (JWT)
│   │   ├── services/           # Business logic (Kleos, email parser, sessions, data retention)
│   │   ├── utils/              # Logger (Winston)
│   │   └── index.ts            # App entry point
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── admin/                  # Admin dashboard (HTML, CSS, JS)
│   │   ├── index.html          # Main dashboard
│   │   ├── login.html          # Login page
│   │   ├── app.js              # Dashboard logic
│   │   └── styles.css          # Styles
│   ├── widget/
│   │   └── chatbot.js          # Embeddable chatbot widget
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yaml
├── .env.example                # Template for environment variables
└── README.md
```


## Prerequisites

- Docker and Docker Compose installed on the host machine
- A domain or subdomain for the server (e.g., `intake.mth-partner.de`)
- An email account with IMAP access (Google Workspace, Gmail, or any IMAP provider)
- OpenAI API key (for email parsing)
- Kleos API credentials (client ID, client secret, token URL)


## Installation and Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd AI-based-Intake-and-Email-Integration-with-Kleos-API
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your actual credentials. See the "Environment Variables" section below for details on each variable.

### 3. Start the services

```bash
docker-compose up -d
```

This starts three containers:
- `kleos-intake-db` -- PostgreSQL database (port 5432)
- `kleos-intake-backend` -- Node.js API server (port 3000)
- `kleos-intake-frontend` -- Nginx serving admin panel (port 3001)

The database schema is automatically created on first startup.

### 4. Verify

- Backend health check: `http://localhost:3000/health`
- Admin dashboard: `http://localhost:3001/admin/`
- Chatbot widget preview: `http://localhost:3001/widget/chatbot.js`

### 5. Embed the chatbot on your website

Add this single line to your WordPress site (or any HTML page):

```html
<script src="https://your-server-domain:3000/widget/chatbot.js"></script>
```

If the backend runs on a different domain than the website, the CORS settings in `FRONTEND_URL` must include that domain.


## Environment Variables

All configuration is done through the `.env` file. Below is a description of every variable:

### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |
| `PORT` | Backend server port | `3000` |
| `FRONTEND_URL` | Allowed CORS origin (the URL where the chatbot widget is hosted) | `http://localhost:3001` |

### Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Full PostgreSQL connection string | (see .env.example) |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `kleos_intake` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |

### Kleos API

| Variable | Description |
|----------|-------------|
| `KLEOS_API_BASE_URL` | Kleos API base URL |
| `KLEOS_CLIENT_ID` | OAuth2 client ID for Kleos |
| `KLEOS_CLIENT_SECRET` | OAuth2 client secret for Kleos |
| `KLEOS_TOKEN_URL` | OAuth2 token endpoint |
| `KLEOS_CASE_TYPE_ARBEITSRECHT` | Kleos case type ID for employment law |
| `KLEOS_CASE_TYPE_MIETRECHT` | Kleos case type ID for rental law |
| `KLEOS_CASE_TYPE_SONSTIGES` | Kleos case type ID for other |
| `KLEOS_DOCUMENT_FOLDER_ALL` | Kleos document folder ID |
| `KLEOS_RESPONSIBLE_LAWYER_ID` | Kleos lawyer ID for case assignment |

### Email Intake (IMAP)

| Variable | Description | Default |
|----------|-------------|---------|
| `IMAP_HOST` | IMAP server hostname (e.g., `imap.gmail.com`) | |
| `IMAP_PORT` | IMAP port | `993` |
| `IMAP_SECURE` | Use TLS | `true` |
| `IMAP_USERNAME` | Email address to monitor | |
| `IMAP_PASSWORD` | Email password or App Password | |
| `IMAP_POLL_INTERVAL_MINUTES` | How often to check for new emails | `5` |

For Google Workspace / Gmail: use an App Password (generate at Google Account > Security > App Passwords). Regular passwords will not work.

### OpenAI

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for email parsing |

### Admin Authentication

| Variable | Description |
|----------|-------------|
| `ADMIN_USERNAME` | Username for admin panel login |
| `ADMIN_PASSWORD` | Password for admin panel login |
| `JWT_SECRET` | Secret key for signing JWT tokens (use a long random string) |
| `JWT_EXPIRES_IN` | Token expiration duration (e.g., `7d`, `24h`) |

### File Uploads

| Variable | Description | Default |
|----------|-------------|---------|
| `UPLOAD_DIR` | Directory for uploaded files | `./uploads` |
| `MAX_FILE_SIZE_MB` | Maximum file size in MB | `10` |
| `ALLOWED_FILE_TYPES` | Comma-separated list of allowed extensions | `pdf,doc,docx,jpg,jpeg,png` |

### GDPR

| Variable | Description | Default |
|----------|-------------|---------|
| `GDPR_CONSENT_TEXT` | Consent text shown in the chatbot | (see .env.example) |
| `DATA_RETENTION_DAYS` | Days to keep data before automatic cleanup | `30` |


## Deployment to Production

### Option A: Deploy on a VPS (recommended)

1. Provision a Linux server (Ubuntu 22.04 recommended) with Docker installed.

2. Clone the repository and configure `.env` as described above.

3. Set up a reverse proxy (Nginx or Caddy) on the host to handle SSL and route traffic:
   - `intake-api.your-domain.de` -> `localhost:3000` (backend API + widget)
   - `intake-admin.your-domain.de` -> `localhost:3001` (admin dashboard)

4. Start the services:
   ```bash
   docker-compose up -d
   ```

5. Embed the chatbot on your WordPress site:
   ```html
   <script src="https://intake-api.your-domain.de/widget/chatbot.js"></script>
   ```

6. Update `FRONTEND_URL` in `.env` to match the WordPress site URL for CORS.

### Option B: Deploy on a managed platform

The Docker Compose setup works on any platform that supports Docker, including:
- AWS (EC2, ECS)
- Google Cloud (Compute Engine, Cloud Run)
- DigitalOcean (Droplets, App Platform)
- Hetzner Cloud

### SSL / HTTPS

For production, HTTPS is required. Use a reverse proxy like Caddy (automatic SSL) or Nginx with Let's Encrypt.

Example Caddy configuration:

```
intake-api.your-domain.de {
    reverse_proxy localhost:3000
}

intake-admin.your-domain.de {
    reverse_proxy localhost:3001
}
```


## Usage

### Admin Dashboard

1. Navigate to `https://intake-admin.your-domain.de/admin/`
2. Log in with the credentials configured in `ADMIN_USERNAME` and `ADMIN_PASSWORD`
3. View and manage inquiries from both the chatbot and email channels
4. Change inquiry status, review conversation history and uploaded documents
5. Export cases to Kleos with the "Nach Kleos exportieren" button

### Chatbot Widget

The chatbot appears as a floating button on the website. When clicked, it opens a guided conversation that:
- Asks about the legal area (Arbeitsrecht, Mietrecht, Sonstiges)
- Walks through topic-specific questions
- Allows document uploads (up to 15 files)
- Collects contact information (name, email, phone)
- Requests GDPR consent before submission

### Email Intake

Send emails to the configured inbox address. The system automatically:
- Polls the inbox at the configured interval
- Parses the email text with AI to extract legal area, topic, and contact info
- Saves any attachments as documents
- Creates a new inquiry in the admin panel


## Rebuilding After Changes

If you modify backend source code:

```bash
docker-compose build --no-cache backend
docker-compose up -d backend
```

If you modify frontend files (admin HTML/CSS/JS or chatbot widget), changes are picked up immediately since the frontend directory is volume-mounted in Docker. Just refresh the browser.

If you change `.env` values (no code changes):

```bash
docker-compose up -d backend
```

This recreates the container with the new environment variables without a full rebuild.


## Troubleshooting

- **CORS errors**: Make sure `FRONTEND_URL` in `.env` matches the domain where the chatbot is embedded.
- **Backend restart loop**: Check `backend/logs/error.log` for the actual error (console output is suppressed in production mode).
- **IMAP "Invalid credentials"**: For Gmail/Google Workspace, you must use an App Password, not the account password. Also verify IMAP is enabled in Gmail settings.
- **IMAP "Timed out"**: The IMAP server may be unreachable from the Docker container. Verify DNS resolution and port 993 accessibility.
- **OpenAI errors**: Verify your API key is valid and has available credits. The system still processes emails without AI (defaults to "Sonstiges / Allgemein").


## Current Deployment (Production)

The system is deployed on a VPS (`152.53.139.177`) using **PM2** as the process manager (not Docker). Two PM2 services run via `ecosystem.config.js`:

| Service | PM2 Name | Port | Description |
|---------|----------|------|-------------|
| Backend | `kleos-backend` | 3002 | Node.js API (Express + TypeScript, compiled to JS) |
| Frontend | `kleos-frontend` | 3003 | Express server serving admin dashboard and chatbot widget |

PostgreSQL runs on port **5433** (separate from any other Postgres instances on the server).

### PM2 Commands

```bash
# Navigate to the project directory
cd /home/emir/AI-based-Intake-and-Email-Integration-with-Kleos-API-delivery

# Check status of all services
pm2 status

# Start both services (first time, or after server reboot)
pm2 start ecosystem.config.js

# Stop services
pm2 stop kleos-backend
pm2 stop kleos-frontend
pm2 stop all                  # stop everything

# Restart services
pm2 restart kleos-backend
pm2 restart kleos-frontend
pm2 restart all               # restart everything

# Follow logs in real time
pm2 logs kleos-backend        # backend only
pm2 logs kleos-frontend       # frontend only
pm2 logs                      # all services

# Follow logs with more lines of history
pm2 logs kleos-backend --lines 200

# View log files directly
tail -f ~/.pm2/logs/kleos-backend-out-4.log    # stdout
tail -f ~/.pm2/logs/kleos-backend-error-4.log  # errors
```

### Rebuilding After Code Changes

```bash
cd /home/emir/AI-based-Intake-and-Email-Integration-with-Kleos-API-delivery

# Rebuild backend (TypeScript → JavaScript) and restart
cd backend && npm run build && pm2 restart kleos-backend

# Frontend changes (HTML/CSS/JS) take effect immediately — just refresh the browser.
# If you changed frontend/server.js:
pm2 restart kleos-frontend
```

### Persisting PM2 Across Reboots

```bash
pm2 save                      # save current process list
pm2 startup                   # generate system startup script (run the command it outputs)
```


## License

(c) 2026 Legal Intake System -- developed by Rechtsanwalt Tieben. All rights reserved.
