# Reefer Track 🧪

**Searchable chain-of-custody tracking for laboratory specimens.**

Reefer Track is a mobile-first prototype built for the **Droidcon Uganda Buildathon**. It helps couriers and laboratory technicians register specimens, locate assigned samples, request handovers, and review a specimen's recorded custody history.

A specimen can pass through several people before it reaches a laboratory. Reefer Track gives each specimen a unique identifier and makes the **current custodian** and **recorded handovers** visible to authorized users.

> **Project status:** Buildathon prototype using synthetic data. Not certified or approved for clinical use.

**API:** [reefer-tracker.vercel.app](https://reefer-tracker.vercel.app/api/health)  
**Repository:** [github.com/dandanman4k/reefer-tracker](https://github.com/dandanman4k/reefer-tracker)

## Features

- **Role-based access:** couriers receive essential identification and handling fields; laboratory technicians can view additional clinical fields.
- **Specimen inventory:** authenticated users can see specimens currently assigned to them.
- **Sample creation:** technicians can register a new specimen with identifying, collection, container, and storage information.
- **Typesense-powered search:** search indexed specimen metadata with server-enforced ownership and organization checks.
- **Custody transfers:** request individual or bulk handovers to another registered user.
- **Transfer inbox:** recipients can accept or decline pending requests; custody changes only after acceptance.
- **Chain-of-custody history:** review recorded sender, recipient, and handover timestamps.
- **FHIR-inspired data model:** modeled using concepts from the [HL7 FHIR R4 Specimen resource](https://hl7.org/fhir/R4/specimen.html).
- **Demo environment:** synthetic users, samples, and transfer records for demonstrations and testing.

## Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Mobile client | Flutter | Android user interface |
| Backend | Node.js 20+, Express | Authentication, API, permission checks, transfer workflows |
| Database and authentication | Supabase (PostgreSQL + Auth) | Authoritative sample, user, and transfer records |
| Search | Typesense | Indexed specimen search |
| API deployment | Vercel | Hosted Express API |

The **PostgreSQL database is the source of truth**. Typesense indexes a limited subset of metadata for search; it does not replace the database or act as the authorization boundary.

## How a transfer works

```text
Current holder selects specimen(s)
                 |
                 v
        Transfer request created
                 |
          Recipient inbox
             /       \
          Accept    Decline
            |          |
     Holder changes  Holder unchanged
            |
    Custody history recorded
```

Pending requests do not immediately change a specimen's current holder. The backend relies on database-side transfer functions to make custody changes atomically.

## Repository layout

This GitHub repository contains the **Node.js backend** at its root:

```text
reefer-tracker/
├── src/
│   ├── app.js                 # Express routes
│   ├── config.js              # Supabase and Typesense configuration
│   ├── privacy.js             # Role-aware response serializers
│   ├── search_document.js     # Search document mapping
│   ├── typesense.js           # Search index integration
│   └── validate.js            # Request validation
├── scripts/
│   ├── seed-demo.mjs          # Demo users and sample records
│   ├── reindex-typesense.mjs  # Rebuild search index
│   └── smoke-test.mjs         # API integration smoke test
├── tests/                     # Node test suite
├── index.js                   # Vercel Express entry
├── server.js                  # Local development server
├── package.json
└── vercel.json
```

The **Flutter client** and **Supabase SQL setup scripts** are distributed separately in the full project starter. They are not currently part of this backend repository.

## Getting started

### Prerequisites

- Node.js **20 or newer**
- A Supabase project
- A Typesense server or Typesense Cloud cluster

### 1. Clone and install

```bash
git clone https://github.com/dandanman4k/reefer-tracker.git
cd reefer-tracker
npm install
```

### 2. Set up Supabase

In the Supabase **SQL Editor**, run the project's `supabase/schema.sql` from the full starter package before seeding. It creates the organizations, profiles, specimens, transfer records, supporting policies, and transfer functions.

> The SQL setup file is not currently checked into this backend-only repository. Obtain it from the full project package; do not run the seed script against an uninitialized database.

### 3. Configure the environment

Create a local `.env` file in the repository root:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

TYPESENSE_HOST=YOUR_TYPESENSE_HOST
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
TYPESENSE_ADMIN_API_KEY=YOUR_TYPESENSE_ADMIN_KEY

PORT=3000
ALLOWED_ORIGINS=http://localhost:3000
ALLOW_SQL_SEARCH_FALLBACK=false
```

**Never commit `.env` or put Supabase service-role or Typesense admin keys in the Flutter app.** Store production secrets in Vercel environment variables. Rotate any secret accidentally committed to Git, even if a push was blocked.

### 4. Create demo records

```bash
npm run seed
```

This creates **four demonstration accounts**, six synthetic specimens, and example transfer history. The seed script is designed to preserve existing custody changes when re-run.

| Role | Demo email | Password |
| --- | --- | --- |
| Courier | `courier@reefertrack.demo` | `Demo1234!` |
| Lab technician | `technician@reefertrack.demo` | `Demo1234!` |
| Lab technician | `grace@reefertrack.demo` | `Demo1234!` |
| Courier | `paul@reefertrack.demo` | `Demo1234!` |

Demo organization: **Reefer Demo Lab**  
Demo join code: `REEFER-DEMO-2026`

**These credentials are public test fixtures, not real accounts for a production system.**

### 5. Run the server locally

```bash
npm run dev
```

Check [http://localhost:3000/api/health](http://localhost:3000/api/health). This endpoint indicates whether key integrations are **configured**; it is not a full connectivity check.

### 6. Index specimens in Typesense

```bash
npm run reindex
```

Run this after seeding or when you need to rebuild the search index from PostgreSQL.

## API endpoints

The API uses JSON. Authenticated routes require `Authorization: Bearer <access_token>`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | API configuration status |
| `POST` | `/api/auth/signup` | Register an account |
| `POST` | `/api/auth/login` | Log in using email or unique full name |
| `POST` | `/api/auth/refresh` | Refresh authentication session |
| `GET` | `/api/me` | Current user profile |
| `GET` | `/api/users?q=` | Search eligible transfer recipients |
| `GET` | `/api/samples` | List specimens held by current user |
| `GET` | `/api/samples?q=` | Search authorized specimens via Typesense |
| `POST` | `/api/samples` | Create a specimen (technician only) |
| `GET` | `/api/samples/:id` | Role-filtered specimen details |
| `GET` | `/api/samples/:id/history` | Specimen custody history |
| `GET` | `/api/samples/:id/fhir` | FHIR R4-shaped Specimen export (technician only) |
| `GET` | `/api/inbox` | Incoming and outgoing transfer requests |
| `POST` | `/api/transfers` | Request one or more handovers |
| `POST` | `/api/transfers/:id/respond` | Accept or decline a request |

### Example: authenticate

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"courier@reefertrack.demo","password":"Demo1234!"}'
```

### Example: search assigned specimens

```bash
curl "http://localhost:3000/api/samples?q=RT-UG" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Testing

```bash
# Automated Node.js tests
npm test

# Requires a running API and seeded demo data
npm run smoke
```

The smoke test checks courier field restrictions, sample ownership, creation permissions, and Typesense integration. It does **not** test the complete sample-transfer workflow.

A transfer-specific smoke test is available in the extended project starter, but the current public repository's `package.json` does not define `npm run smoke:transfer`.

## Deploying the backend to Vercel

1. Import this repository into [Vercel](https://vercel.com/).
2. Set the project **Root Directory** to the repository root (`./`).
3. Select the **Express** framework preset.
4. Add the Supabase and Typesense variables from your local `.env` in **Project Settings → Environment Variables**.
5. Deploy and check `https://YOUR-DEPLOYMENT.vercel.app/api/health`.

Do not upload your local `.env` to GitHub or embed server secrets into mobile builds.

## Building the companion Android application

The Flutter project lives in the separate full starter package, not this backend repository. From its Flutter directory:

```bash
flutter create . --platforms=android --project-name reefer_track
flutter pub get
flutter build apk --release --dart-define=API_BASE_URL=https://reefer-tracker.vercel.app
```

Ensure `android.permission.INTERNET` is declared in the **main** Android manifest before building. The optional `build_release.ps1` in the extended Flutter starter can prepare the manifest automatically.

APK output: `build/app/outputs/flutter-apk/app-release.apk`

## Privacy and medical standards

- Courier responses use server-side field allowlists instead of relying only on hiding UI elements.
- Search access is limited to the authenticated user's permitted specimens and rechecked against PostgreSQL.
- The specimen data model follows **concepts from HL7 FHIR R4 Specimen**, but Reefer Track is **not a certified or fully conformant FHIR server**.
- The buildathon prototype is intended for synthetic data. Real clinical use requires organizational approval workflows, stronger role assignment, security auditing, operational controls, and regulatory review.

## Roadmap

- Verified organization registration and an administrative approval dashboard
- Additional custody roles, including storage facilities and vaults
- Shared organizational specimen pools with granular transfer rights
- Barcode/QR scanning and verified physical handovers
- Offline-aware transport workflows
- Temperature monitoring, alerts, and cold-chain history
- Broader FHIR interoperability with hospital and laboratory systems

## Project purpose

Reefer Track explores a simple principle: **every laboratory specimen should have a known responsible custodian and a traceable record of recorded handovers.**

Built as a prototype for the **Droidcon Uganda Buildathon**, with **Typesense** as its search engine.
