# Central Kitchen Khulna Fisheries

Next.js + Tailwind + MongoDB fish inventory and sales system, ready for Vercel deployment.

## Features

- Black/white clean admin UI branded as **Central Kitchen Khulna Fisheries**
- MongoDB Atlas-ready data layer
- Role-based login with hardcoded seeded users:
  - `super_admin` (full access)
  - `admin` (inventory/product management)
  - `employee` (view inventory + manage sales)
- FIFO inventory costing by batch purchase date
- Waste-aware costing (default waste `10%`, adjustable per batch)
- Daily donation accounting (`5%` of gross profit)
- Net profit calculation (`gross profit - donation`)

## Run Locally

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Vercel Deployment

Set these environment variables in Vercel Project Settings:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (set to your production URL after deploy)
- `REPORT_TIMEZONE` (e.g. `Asia/Dhaka`)
- `SUPER_ADMIN_PASSWORD`
- `ADMIN_PASSWORD`
- `EMPLOYEE_PASSWORD`

## Default Login Emails

- `superadmin@fisher.local`
- `admin@fisher.local`
- `employee@fisher.local`

Passwords are taken from env variables above (hardcoded defaults are in `.env.example`).
