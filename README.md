# The Pulp Doctor

A React website and Express API for Dr Charu Makhija, with appointment requests, dentist referrals, private referral attachments, transactional email, and protected practice administration.

## Architecture

- `artifacts/pulp-doctor/` — React, TypeScript, Vite, Tailwind CSS; the public site, referral flow, and admin interface.
- `artifacts/api-server/` — Node.js, Express, Mongoose; all database access, authentication, bookings, referrals, email, and Cloudinary operations.
- `lib/api-spec/openapi.yaml` — shared API contract used to generate the frontend client and backend Zod validators.
- MongoDB Atlas stores clinic schedules, appointments, referrals, upload metadata, admin accounts, contacts, and notification status. Referral files are authenticated Cloudinary assets. Resend is used only by the backend.

The API is a persistent Express service and should be deployed separately from the static frontend. No backend credentials belong in Vite variables.

## Requirements

- Node.js 22.12 or later (Node 22 LTS recommended), Git, pnpm, and VS Code.
- A MongoDB Atlas cluster/user with the development machine and deployed API host allowed by the Atlas network access list. Booking/referral transactions require a replica-set deployment (Atlas provides this).
- Cloudinary account credentials for private referral uploads.
- Resend account, a verified sender, and a webhook signing secret for email delivery tracking.

## Open in VS Code and run locally

Clone the repository or open its existing folder in VS Code. Run the following commands in the VS Code integrated terminal from the repository root:

```sh
git clone <your-repository-url>
cd The-Pulp-Doctor-Website
corepack enable
pnpm install
cp artifacts/api-server/.env.example artifacts/api-server/.env.local
```

Edit `artifacts/api-server/.env.local` and set:

- `MONGODB_URI` — the Atlas connection string. Use a database-specific, least-privilege user and URL-encode special characters in the password.
- `SESSION_SECRET` — a unique random secret of at least 32 bytes. For example, generate one with `openssl rand -base64 48`; do not commit it.
- `APP_ORIGIN=http://localhost:5174,http://127.0.0.1:5174`.
- Cloudinary `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to enable referral uploads.
- `RESEND_API_KEY`, a verified `EMAIL_FROM`, and `RESEND_WEBHOOK_SECRET` to enable email and delivery callbacks. `DOCTOR_EMAIL` defaults to `drcharu.25@gmail.com`.

Do not replace or copy real secrets into tracked example files. `.env.local` is ignored by Git. The frontend’s optional `artifacts/pulp-doctor/.env.local` may set `VITE_API_BASE_URL` to an API **origin**; leave it unset for local development, where Vite proxies `/api` to port 8080.

Create clinic schedule records once for a development database:

```sh
pnpm --filter @workspace/api-server run seed:dev
```

Create the first administrator from an interactive terminal; the password is not echoed and only its hash is stored:

```sh
DOTENV_CONFIG_PATH="$PWD/artifacts/api-server/.env.local" pnpm --filter @workspace/api-server run admin:create
```

Start both applications from the repository root:

```sh
npm run dev
```

- Website: <http://localhost:5174>
- API health check: <http://localhost:8080/api/healthz>
- Admin sign-in: <http://localhost:5174/admin/login>

Press Ctrl+C to stop both processes. To choose different local ports, use `API_PORT=8081 FRONTEND_PORT=5175 npm run dev`. The local launcher automatically allows `localhost` and `127.0.0.1` at the selected frontend port for the development API, so admin sign-in continues to work when you use alternate ports. Production still uses only the configured `APP_ORIGIN` allowlist.

The services can also be started independently in separate VS Code terminals from the repository root:

```sh
DOTENV_CONFIG_PATH="$PWD/artifacts/api-server/.env.local" pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/pulp-doctor run dev
```

The API requires `PORT` and reads `DOTENV_CONFIG_PATH`. The root launcher sets the API environment path and Vite proxy target automatically.

## Editing content

The public landing page, referral form, and administrator screens are composed in `artifacts/pulp-doctor/src/App.tsx`; reusable UI primitives are under `artifacts/pulp-doctor/src/components/`. Global styling and design tokens are in `artifacts/pulp-doctor/src/index.css`. Static assets (including `logo.jpeg`) belong in `artifacts/pulp-doctor/public/`. Clinic locations and published hours are database records, not hard-coded landing page content.

## Checks and API changes

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/pulp-doctor run build
```

After changing `lib/api-spec/openapi.yaml`, regenerate the shared API client/validators:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Manual cleanup can remove expired unused upload reservations and Cloudinary assets orphaned for over one hour:

```sh
DOTENV_CONFIG_PATH="$PWD/artifacts/api-server/.env.local" pnpm --filter @workspace/api-server run storage:cleanup
```

This command preserves files referenced by submitted referrals. Referral files are not automatically deleted; the practice must approve a clinical-record retention policy before those files are removed.

## Deployment

### Frontend on Vercel

1. Import the GitHub repository into Vercel.
2. Keep the Vercel project root at the **repository root** so pnpm can resolve workspace packages and the shared API client. The root `vercel.json` selects only the frontend build and its static output.
3. Use the committed settings: install `pnpm install --frozen-lockfile`, build `pnpm --filter @workspace/pulp-doctor run build`, output directory `artifacts/pulp-doctor/dist/public`. Client-side routes (`/refer-a-patient`, `/admin`, etc.) are rewritten to the Vite `index.html`.
4. Set `VITE_API_BASE_URL` separately for Development, Preview, and Production to the relevant API **origin only**, without a trailing `/api`. For example, use `https://<your-api-host>` once the backend is deployed. Never put MongoDB, Resend, Cloudinary, or session secrets in Vercel.
5. Redeploy after changing Vercel environment variables. Check the deployed `/api/healthz` on the API host and inspect browser network requests to confirm they target that host, not a Vite HTML fallback.

### Express API on a persistent Node.js host

Deploy the API separately on a Node service (for example, Render, Railway, or Fly.io), with the repository root as its working directory:

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm --filter @workspace/api-server run build`
- Start: `pnpm --filter @workspace/api-server run start`
- Set the platform-provided `PORT` if required.

The existing server starts with `app.listen()` and has persistent MongoDB connections and multi-document booking/referral transactions. It is not packaged as a Vercel Function; deploy it as a persistent Node service rather than assuming the current Express entry point is serverless-compatible.

Configure these backend-only environment variables on the API host:

`NODE_ENV=production`, `PORT` (if required by the host), `MONGODB_URI`, `SESSION_SECRET`, `APP_ORIGIN`, `AUTH_COOKIE_SAME_SITE`, `DOCTOR_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and (if used) `PUBLIC_PHONE` and `CANCELLATION_CUTOFF_HOURS`.

Set `APP_ORIGIN` to an exact comma-separated allowlist of the real Vercel production and approved preview origins. Do not use `*`. For a frontend/API on different registrable domains, use `AUTH_COOKIE_SAME_SITE=none`; production cookies are Secure and HttpOnly, and browser requests include credentials. Confirm that the deployed frontend and API use HTTPS and that CORS and origin checks include each intended origin.

In Resend, configure a webhook at `https://<your-api-host>/api/webhooks/resend` for delivered, bounced, and failed events, then put its signing secret in `RESEND_WEBHOOK_SECRET`. Never run clinic seeding or administrator creation during production builds; perform each only through an intentional, controlled operation against the intended database. Create production clinic records and the first admin through the secured setup procedure.

## Troubleshooting

- Missing variables: copy the API example to `artifacts/api-server/.env.local`, check the variable names, and restart the API. Never paste secrets into client-side `VITE_*` variables.
- MongoDB connection errors: verify the URI/database/user, URL-encode credentials, and allow the current API host IP in Atlas. Atlas transactions need a replica set.
- Admin login/CORS/cookies: ensure `APP_ORIGIN` exactly matches the browser origin. For cross-site production deployments set `AUTH_COOKIE_SAME_SITE=none`, HTTPS, and credentialed CORS.
- Email failures: verify the Resend API key, verified `EMAIL_FROM`, `DOCTOR_EMAIL`, and the webhook signing secret. “Accepted” means provider acceptance; only a verified delivery webhook marks a message delivered.
- Referral upload failures: verify all three Cloudinary credentials, allowed file type/extension, and the 10 MB limit. Uploads must complete through the API and are private; direct public Cloudinary URLs are not used.

Review practice-approved privacy, consent, retention, cancellation, and contact wording before accepting real patient information. Do not claim deployment or provider connectivity until tested against the actual configured services.
