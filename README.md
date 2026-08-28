# PUMP KART

Bright, behind-the-kart 3D arcade racing rebuilt around the pump.fun world.

## Playable now

- Fast eight-kart races with three laps and live position tracking
- High-authority directional steering with quicker turn-in, stronger lateral grip, camera-follow yaw and road-edge recovery
- Reverse gear, drift-hop initiation, stable drift arcs, charged release boosts and perfect launches
- Green boost pads and floating Pump item boxes
- Forgiving full-size collision zones for item boxes and boost pads, with immediate pickup feedback in solo and online races
- Premium item-box sequence with proximity attraction, layered 3D glass/pill geometry, impact shell, shards, light burst, screen flash, timed roulette ticks, custom SVG reveal and ready/use states
- Distinct world VFX for all six power-ups, boost pads, drift sparks, shield pulses, impacts, laps and finishes
- Fully custom non-emoji racer badges and power-up iconography
- Kart suspension pitch, chassis roll, visible front-wheel steering, camera boost kick, touch haptics and safe-area-aware mobile controls
- Fixed over-the-kart chase camera matching the intended party-racer POV across speed, drift and boost states
- Instanced, hard-capped micro-FX pools keep crate pickups at three draw calls instead of allocating dozens of meshes and materials per hit
- Karts and drivers run at 64% of the original world scale so eight racers have clear passing room without losing silhouette readability
- Elliptical kart contacts use penetration correction, directional momentum transfer, side-swipe impulses, contact friction and controlled wall rebound in both local and authoritative multiplayer simulation
- Six crypto power-ups: Green Candle, Pump Rocket, Diamond Hands, Rug Pull, MEV Zap and Airdrop
- Three distinct tracks: Pump Park, Bonding Beach and Moon Market
- Detailed 3D karts with sidepods, fenders, rims, spoilers, exhausts and Pump branding
- Distinct Pump racers including Whale, Ape, Dev, Bot, Diamond Hands, Chad and Jeet silhouettes
- Track-specific worlds with dense animated surroundings: Pump Park grandstands/plaza/ferris wheel/blimp, Bonding Beach lighthouse/pier/sailboats/cabanas, and Moon Market launch complex/lunar base/neon bazaar
- 31 frozen CC0 Kenney 3D models across race infrastructure, vehicles, vegetation, beach props and space scenery
- Poly Haven CC0 PBR asphalt, grass, coastal sand and lunar surfaces with local diffuse/normal/roughness maps
- Soft dynamic shadows on karts and modeled scenery, plus over 100 placed environment objects per track
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

Third-party CC0 provenance and source URLs are recorded in [`assets/free/SOURCES.md`](assets/free/SOURCES.md).
