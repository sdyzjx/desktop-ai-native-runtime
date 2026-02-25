# Desktop App

Electron desktop shell for the existing gateway UI.

## Run

1. Install dependencies:
   - `npm install`
2. Start desktop app (auto-starts embedded gateway):
   - `npm run desktop:start`

## Dev Notes

- Default gateway URL: `http://127.0.0.1:3000`
- Override URL: `DESKTOP_GATEWAY_URL=http://127.0.0.1:3100 npm run desktop:start`
- Connect to an already-running gateway:
  - `DESKTOP_EXTERNAL_GATEWAY=1 npm run desktop:start`
