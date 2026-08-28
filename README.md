# PUMP KART

Bright, behind-the-kart 3D arcade racing rebuilt around the pump.fun world.

## Playable now

- Fast eight-kart races with three laps and live position tracking
- High-authority directional steering with quicker turn-in, stronger lateral grip, camera-follow yaw and road-edge recovery
- Reverse gear, drift-hop initiation, stable drift arcs, charged release boosts and perfect launches
- Green boost pads and floating Pump item boxes
- Six crypto power-ups: Green Candle, Pump Rocket, Diamond Hands, Rug Pull, MEV Zap and Airdrop
- Three distinct tracks: Pump Park, Bonding Beach and Moon Market
- Detailed 3D karts with sidepods, fenders, rims, spoilers, exhausts and Pump branding
- Distinct Pump racers including Whale, Ape, Dev, Bot, Diamond Hands, Chad and Jeet silhouettes
- Track-specific worlds with dense animated surroundings: Pump Park grandstands/plaza/ferris wheel/blimp, Bonding Beach lighthouse/pier/sailboats/cabanas, and Moon Market launch complex/lunar base/neon bazaar
- Original high-energy Pump Kart Grand Prix music plus layered engine audio, tire scrub, boost airflow, impact synthesis and sampled boost/item effects
- Race UI with standings, timer, item slot, map, lap counter and speed/boost display
- Keyboard and mobile touch controls
- Local two-player split-screen races
- Live Colyseus matchmaking, private room codes, track voting, ready states and host migration
- Authoritative server simulation for input, laps, items, boosts, collisions and finish order
- Eight-kart online grids with AI fill and a 20-second reconnection window

## Controls

- **P1:** W/S accelerate and brake · A turns left · D turns right · arrows also steer · Space/Left Shift drift · E/F item
- **P2:** arrows · Right Shift/Numpad 0 drift · / or Numpad Enter item
- **R:** restart race
- **Mobile:** on-screen steering, gas, brake, drift and item buttons

## Run locally

```bash
python3 -m http.server 5178 --bind 0.0.0.0
```

Then open <http://localhost:5178>.

Run the multiplayer service separately from `server/` with `npm start`; the web client automatically uses `ws://127.0.0.1:2567` on localhost and the Fly WebSocket service in production.

## Scope

This is a playable arcade build with real local and online multiplayer. No wallet, token, or mainnet actions are included.
