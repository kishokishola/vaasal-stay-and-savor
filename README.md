# Vaasal Villa Hotel

Luxury villa hotel website with room booking requests, restaurant menu and a staff-only POS. GitHub Pages hosts the static site; Firebase Authentication and Cloud Firestore provide the backend, with the existing Supabase rooms and menu used as a live public-catalogue fallback until Firestore data is migrated.

## Run locally

Requirements: Node.js 22 or later and npm.

```sh
npm ci
Copy-Item .env.example .env
npm run dev
```

Fill `.env` with the Firebase web app configuration values. In Firebase Console, enable Email/Password and Anonymous sign-in in Authentication, create Firestore, and add your local host and `kishokishola.github.io` to Authentication's authorized domains. Anonymous sign-in is used invisibly for customer food-order requests; it does not create a customer sign-up page or grant staff access. This Spark Free setup does not use Firebase Storage.

## Firebase and GitHub Pages setup

1. Create a Firebase project and register a Web app. Enable **Authentication → Email/Password** and **Authentication → Anonymous**, and create a Firestore database. This Spark Free setup does not use Firebase Storage.
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

Open `/auth` directly and sign in with the Firebase email and password provisioned by an administrator. The customer website does not display a staff login link. Legacy Supabase passwords cannot be reused as Firebase passwords.

Firebase Email/Password sign-in does not require email verification. Administrators create staff accounts in **Staff → Create staff account**; customers cannot create or assign staff roles. Staff can request a password reset from `/auth`; if the reset email is unavailable, an administrator must reset the password in Firebase Authentication. If Firebase reports `auth/unauthorized-domain`, add the exact website hostname to **Authentication → Settings → Authorized domains**.

The project owner must bootstrap the first admin in Firestore by creating a `staff_access/{lowercase-email}` document with `email` and `role: "admin"` fields. Publish `firestore.rules` before staff sign-in so role checks and staff operations are allowed. The rules retain role-based staff checks and admin-only role assignment; never let users self-assign a role. The public website shows an **Admin dashboard** link only to authenticated administrators.

## Restaurant menu and POS

Staff can manage food names, categories, descriptions, prices, availability and photos from **Staff → Menu**. Uploaded food photos are resized and saved with the menu document in Firestore, so Firebase Storage is not required. If Firestore has no menu catalogue yet, the staff menu and POS read the existing Supabase public catalogue; the first menu edit copies that catalogue into Firestore before saving the change.

The **Dining** page builds a cart from the live available menu, calculates the estimated subtotal and saves a pending customer order request in Firestore. Staff can review and update those requests in **Orders & Sales**; they should verify the current menu and enter the final bill in the POS before collecting payment. Online order requests do not process payments. The staff POS supports dine-in, takeaway and room service, customer details, quantities, discounts, service charge, tax, payment method/status and printable receipts. Staff can update restaurant order progress and review daily sales. Publish Firestore rules after updating them so public order requests and staff status changes are permitted.

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
