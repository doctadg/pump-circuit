# Pump Kart Colyseus Backend

Authoritative online multiplayer service for Pump Kart.

## Features

- Public matchmaking and private room IDs
- Host migration, ready states, track voting and rematches
- Eight-kart authoritative simulation with AI filling empty slots
- Validated 20 Hz player input and server-side bounds
- Server-owned laps, items, boosts, collisions, finish order and results
- Twenty-second race reconnection window
- Health and readiness endpoints

## Local development

```bash
npm install
npm test
npm run build
npm start
```

The service listens on `http://localhost:2567`.

## Wire messages

Client to server: `input`, `ready`, `track`, `start`, `useItem`, `rematch`.

Server to client: synchronized `PumpKartState`, plus `event` and `lobby` messages.

## Deployment

The included `Dockerfile` targets Node 22 and `fly.toml` deploys a single always-on machine in Singapore. A single instance is deliberate because room presence is currently process-local.
