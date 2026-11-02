<img src="assets/icon.svg" width="64" height="64" alt="Running Log icon">

# Running Log

A local-first Electron training log for a competitive distance runner. It imports original Garmin FIT activities, preserves detailed sensor metrics, analyzes workouts with AI, compares intervals and mechanics over time, and supports training cycles, planning, and journaling.

All training data stays in the Electron `userData` directory on the local machine. API keys are stored with Electron `safeStorage`; Garmin passwords are never persisted.

## Development

Requirements:

- Node.js and npm
- Python 3 with `garminconnect` for optional Garmin sync

```bash
npm install
python3 -m venv .venv
.venv/bin/python -m pip install garminconnect
npm run dev
```

The Vite development server runs on `http://localhost:5174`.

## Verification

```bash
npm run typecheck
npm test
npx vite build
```

Garmin sync uses the unofficial community `garminconnect` package and may break when Garmin changes its private API. FIT file import remains available independently.
