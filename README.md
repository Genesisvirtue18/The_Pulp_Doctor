# The Pulp Doctor

A responsive specialist dentistry website for Dr Charu Makhija, with online appointment requests, dentist referrals, private referral attachments, and an administrator workspace.

## Project layout

- `artifacts/pulp-doctor/` — React + TypeScript + Vite website
- `artifacts/api-server/` — Express API, MongoDB/Mongoose models, booking, referral, authentication, email, and private storage services
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Development setup

1. Copy `artifacts/api-server/.env.example` to a local ignored environment file or add the corresponding values in Replit Secrets. Never commit real `.env` files.
2. Add `MONGODB_URI` for a MongoDB Atlas database with a least-privilege app user and restricted network access.
3. Add the existing `SESSION_SECRET` secret to the API process. It signs short-lived, HTTP-only admin session cookies.
4. Add `RESEND_API_KEY` and a verified `EMAIL_FROM` to enable transactional email. `DOCTOR_EMAIL` defaults to the address in the project brief.
5. Configure a private S3-compatible bucket with public access blocked, server-side encryption enabled, and a lifecycle/retention policy appropriate for clinical records. Set the bucket, region, endpoint (if required), and access credentials.
6. Set `APP_ORIGIN` only when the frontend is hosted on a different origin. `PUBLIC_PHONE` is intentionally blank until supplied by the doctor.

The public website can be previewed without these services, but booking, referral submission, admin access, email, and attachment upload return explicit service-unavailable states until their required configuration and records exist. The app never reports a database write or upload as successful when it did not happen.

## Clinic data setup

For development only, after configuring `MONGODB_URI`, run:

```sh
pnpm --filter @workspace/api-server run seed:dev
```

This inserts the three clinic locations and weekly schedules from the supplied brief if they do not exist. It does not overwrite existing clinic or schedule records. Monday, Tuesday, Wednesday, Friday, and Saturday hours are stored in MongoDB; Thursday and Sunday remain closed until an administrator publishes an override. All clinic-local dates use `Asia/Kolkata`.

## Secure administrator setup

Create the initial admin only from a trusted interactive terminal after setting `MONGODB_URI`:

```sh
pnpm --filter @workspace/api-server run admin:create
```

The password is entered without echo and hashed before storage. There is no public registration route and no default credential.

## Email and private files

The API sends minimal transactional messages through Resend when `RESEND_API_KEY` and a verified `EMAIL_FROM` are configured. Delivery status is stored in MongoDB and visible in the admin area. Failed notifications use stable idempotency keys and can be retried without creating duplicate bookings or referrals.

Referral attachments are limited to JPEG, PNG, WebP, and PDF files up to 10 MB. The API issues short-lived private S3-compatible upload URLs, checks object size, declared MIME type, and file signature before accepting a referral, and issues short-lived download URLs only after admin authorization. Do not make the storage bucket public.

The referral acknowledgement confirms submission only; it does not confirm acceptance or an appointment.

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
