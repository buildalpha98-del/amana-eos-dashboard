# Amana OSHC — EOS Management Dashboard

Internal EOS (Entrepreneurial Operating System) management dashboard for the Amana OSHC leadership team. Built with Next.js, TypeScript, Tailwind CSS, PostgreSQL, and Prisma.

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ (or Docker)

### Option 1: Using Docker Compose (recommended)

```bash
docker compose up -d
```

This starts both PostgreSQL and the app. The app will be available at `http://localhost:3000`.

### Option 2: Local Development

1. **Start PostgreSQL** — ensure a PostgreSQL instance is running locally on port 5432.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Set up the database:**
   ```bash
   npm run db:push      # Push schema to database
   npm run db:seed      # Seed with default data
   ```

5. **Start the dev server:**
   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000` and log in with:
   - **Email:** `admin@amanaoshc.com.au`
   - **Password:** `ChangeMe123!`

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed the database |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:generate` | Regenerate Prisma client |

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/        # Login page
│   ├── (dashboard)/         # All authenticated pages
│   │   ├── dashboard/       # Home dashboard
│   │   ├── vision/          # V/TO page
│   │   ├── rocks/           # Quarterly Rocks
│   │   ├── todos/           # Weekly To-Dos
│   │   ├── issues/          # Issue tracking (IDS)
│   │   ├── scorecard/       # Weekly measurables
│   │   ├── meetings/        # L10 meetings
│   │   ├── team/            # Team & accountability
│   │   └── settings/        # Settings & user mgmt
│   └── api/                 # API routes
├── components/
│   ├── layout/              # Sidebar, TopBar
│   └── providers/           # Session & Query providers
├── lib/                     # Prisma client, auth config, utils
└── types/                   # TypeScript type declarations
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend:** Next.js API routes, Prisma ORM
- **Database:** PostgreSQL
- **Auth:** NextAuth.js (credentials provider)
- **UI:** Lucide icons, Radix UI primitives
- **Data Fetching:** TanStack Query

## Roles

| Role | Permissions |
|---|---|
| **Owner** | Full access, user management |
| **Admin** | Manage Rocks, To-Dos, Issues, Scorecard |
| **Member** | View all, manage own items |
