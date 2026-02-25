# Gateway

WebSocket ingress for runtime.

Responsibilities:
- Accept legacy `type=run` debug messages
- Accept JSON-RPC 2.0 requests (`runtime.run`)
- Push all runtime input into `RpcInputQueue`
- Forward runtime notifications/responses back to client
- Expose provider-config APIs:
  - `GET /api/config/providers`
  - `GET /api/config/providers/config`
  - `PUT /api/config/providers/config`
  - `GET /api/config/providers/raw`
  - `PUT /api/config/providers/raw`
- Serve front-end pages:
  - `/` chatbox UI with session sidebar
  - `/config.html` provider YAML graphical management UI
