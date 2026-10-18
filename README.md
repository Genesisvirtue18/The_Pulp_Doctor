# The Pulp Doctor

A responsive specialist dentistry website for Dr Charu Makhija, with online appointment requests, dentist referrals, private referral attachments, and an administrator workspace.

## Project layout

- `artifacts/pulp-doctor/` — React + TypeScript + Vite website
- `artifacts/api-server/` — Express API, MongoDB/Mongoose models, booking, referral, authentication, email, and private storage services
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Development setup

Install pnpm once if it is not already available, then install the workspace dependencies from the repository root:

```sh
npm install --global pnpm
pnpm install
```

Copy the example and configure the local file:

```sh
cp artifacts/api-server/.env.example artifacts/api-server/.env.local
```

- `MONGODB_URI` for a MongoDB Atlas database with a least-privilege app user and restricted network access.
- `SESSION_SECRET` for short-lived, HTTP-only admin session cookies.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` for private referral attachments.
- `RESEND_API_KEY` and a verified `EMAIL_FROM` to enable transactional email. `DOCTOR_EMAIL` defaults to the address in the project brief.
- `APP_ORIGIN` only when the frontend is hosted on a different origin. `PUBLIC_PHONE` is intentionally blank until supplied by the doctor.

Never commit real `.env` files. The local `.env.local` file is ignored by Git.

Start both the API and frontend together from the repository root:

```sh
npm run dev
```

Open <http://localhost:5174>. The frontend uses the Vite proxy to send `/api` requests to the API at <http://localhost:8080>. Press Ctrl+C to stop both processes.
If either port is already in use, select other ones; the frontend proxy follows `API_PORT` automatically:

```sh
API_PORT=8081 FRONTEND_PORT=5175 npm run dev
```

To start only one service, use separate terminals from the repository root:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/pulp-doctor run dev
```

The API reads `artifacts/api-server/.env.local` when started by the root `npm run dev` command. For standalone API commands that need the local settings, prefix them with:

```sh
DOTENV_CONFIG_PATH="$PWD/artifacts/api-server/.env.local"
```

The public website can be previewed without third-party service configuration, but booking, referral submission, admin access, email, and attachment upload require the corresponding configuration and database records.

## Clinic data setup

For development only, after configuring `MONGODB_URI`, run:

```sh
pnpm --filter @workspace/api-server run seed:dev
```

This inserts the three clinic locations and weekly schedules from the supplied brief if they do not exist. It does not overwrite existing clinic or schedule records. Monday, Tuesday, Wednesday, Friday, and Saturday hours are stored in MongoDB; Thursday and Sunday remain closed until an administrator publishes an override. All clinic-local dates use `Asia/Kolkata`.

## Secure administrator setup

Create the initial admin from an interactive terminal at the repository root. The password is entered without echo and hashed before storage:

```sh
DOTENV_CONFIG_PATH="$PWD/artifacts/api-server/.env.local" \
  pnpm --filter @workspace/api-server run admin:create
```

Then sign in at <http://localhost:5174/admin/login>. There is no public registration route or default credential. Protect the administrator password and database credentials.

## Email and private files

The API sends minimal transactional messages through Resend when `RESEND_API_KEY` and a verified `EMAIL_FROM` are configured. Delivery status is stored in MongoDB and visible in the admin area. Failed notifications use stable idempotency keys and can be retried without creating duplicate bookings or referrals.

Referral attachments are limited to JPEG, PNG, WebP, and PDF files up to 10 MB. The API stores these files in Cloudinary, checks size, declared MIME type, and file signature before accepting a referral, and only provides file access after admin authorization. Keep Cloudinary credentials on the server; do not put them in frontend variables.

The referral acknowledgement confirms submission only; it does not confirm acceptance or an appointment.

## Editing the frontend

The website is a React + TypeScript + Vite app in `artifacts/pulp-doctor/`. Its components are in `artifacts/pulp-doctor/src/`; reusable UI components are under `src/components/ui/`. The page content and the `HomePage`, `ReferralPage`, and admin screen implementations currently live in `src/App.tsx`. Edit the corresponding JSX there to change page text or layout. Global styles and shared visual tokens are in `src/index.css`; static public files belong in `artifacts/pulp-doctor/public/`.

## API and checks

Regenerate frontend hooks and server validation schemas after changing OpenAPI:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Useful checks:

```sh
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/pulp-doctor run typecheck
pnpm run typecheck
```

## Deployment checklist

- Set `MONGODB_URI`, `SESSION_SECRET`, Resend configuration, and private S3 credentials as Replit Secrets.
- Create the production administrator and production clinic records through the controlled setup process.
- Verify the Resend sender domain before enabling email.
- Confirm that the S3 bucket is private and its region/endpoint match the configured values.
- Review the privacy, patient-authorization, retention, and cancellation language with the clinic before accepting real patient data.
- Add the production site origin to `APP_ORIGIN` if frontend/API are on separate origins.
- Supply the doctor's phone number and logo/portrait assets before launch.
