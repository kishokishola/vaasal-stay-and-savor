# Vaasal Villa Hotel

Luxury villa hotel website with room booking requests, restaurant menu and a staff-only POS. GitHub Pages hosts the static site; Firebase Authentication and Cloud Firestore provide the backend, with the existing Supabase rooms and menu used as a live public-catalogue fallback until Firestore data is migrated.

## Run locally

Requirements: Node.js 22 or later and npm.

```sh
npm ci
Copy-Item .env.example .env
npm run dev
```

Fill `.env` with the Firebase web app configuration values. In Firebase Console, enable Email/Password in Authentication, create Firestore, and add your local host and `kishokishola.github.io` to Authentication's authorized domains. This Spark Free setup does not use Firebase Storage.

## Firebase and GitHub Pages setup

1. Create a Firebase project and register a Web app. Enable **Authentication → Email/Password** and create a Firestore database. This Spark Free setup does not use Firebase Storage.
2. Add `kishokishola.github.io` to **Authentication → Settings → Authorized domains**.
3. Publish the Firestore rules and indexes using the Firebase CLI signed in on your own computer:

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --only firestore --project YOUR_FIREBASE_PROJECT_ID
   ```

4. Copy `.env.example` to `.env` and set the four `VITE_FIREBASE_*` values from the web app configuration. These are public client configuration values, not service credentials.
5. In GitHub **Settings → Pages**, choose **GitHub Actions** as the build and deployment source. The workflow uses public Firebase and Supabase client configuration; it does not need private service-account keys or secrets.
6. Push to the default branch. The **Deploy to GitHub Pages** workflow builds the static SPA and deploys `dist/client`.

The app can instead be deployed to Firebase Hosting locally, without storing deployment credentials in GitHub:

```sh
npx firebase-tools login
npm run build
npx firebase-tools deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

## Migrate existing Supabase data

The migration reads rooms, bookings, menu items, orders/order items and role assignments from Supabase, preserves each room's existing `image_url`, and provisions Firebase Auth accounts. Existing room and menu data are read live from Supabase on the public pages when the Firebase catalogue is empty or unavailable. Room photos remain hosted where their URLs currently point. To add photos, create a **public** bucket in Supabase Storage, upload files from the Supabase dashboard, and paste each public URL into the staff room editor. The app does not grant browser users direct Supabase upload permissions. Existing Supabase passwords cannot be exported or reused; users must reset their Firebase password.

## Admin sign-in

Open `/auth` (the **Staff / Admin Login** link in the site header/footer) and sign in with a verified Firebase Authentication email. Legacy Supabase accounts are not automatically usable as Firebase passwords; create a Firebase account or use **Forgot password**. The project owner must bootstrap the first admin in Firestore by creating a `staff_access/{lowercase-email}` document with `email` and `role: "admin"` fields. Add the production site's hostname (`kishokishola.github.io`) to Firebase Authentication's authorised domains. Publish `firestore.rules` before staff sign-in so role checks and staff operations are allowed.

Use a trusted local machine with Node.js and private credentials; do not paste credentials into chat or commit them. Set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (never a `VITE_*` variable)
- `FIREBASE_PROJECT_ID`
- `GOOGLE_APPLICATION_CREDENTIALS` pointing to a Firebase service-account JSON with Auth and Firestore administration permissions

Install dependencies and do a read-only check first:

```sh
npm ci
npm run migrate:supabase -- --dry-run
```

When the counts and destination project are verified, run:

```sh
npm run migrate:supabase -- --apply
```

The migration is additive/upserting: it does not clear Firebase data. Review and resolve overlapping confirmed bookings before migration; the script stops rather than silently choosing one. Assign the initial admin in the source Supabase roles before migrating, or create a `staff_access/{lowercase-email}` document with role `admin` using the Firebase Console or Admin SDK before staff sign-in. Never let an arbitrary user self-assign a role.

## Firestore-only booking limitation

Public booking requests are created directly from the browser and remain **pending** until a staff member confirms them. The confirmation transaction claims per-night lock documents, preventing two confirmations for the same room nights. Because this project deliberately does not use Cloud Functions, Firebase cannot fully protect pricing or booking policy from a malicious browser client. Do not take online payments or treat a client-submitted request as a guaranteed reservation without a trusted server-side booking service.

## Checks

```sh
npm run lint
npm test
npm run build
```
