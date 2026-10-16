# +1 Speed Jetpack Escape

A browser remake of the Roblox simulator: every step makes you faster, jetpacks
carry you over lava and voids, and you escape 9 stages for trophies. Multiplayer
runs on [Colyseus](https://colyseus.io); login, avatars and Gems purchases come
from the Boxity (Bloxity) SDK, and the game is hosted on Boxity Legion.

```
client/   React + three.js (react-three-fiber) game client, Vite
server/   Colyseus 0.18 game server + Express API (auth passthrough, purchase webhook)
shared/   Game balance (config.js) and the deterministic world generator (world.js),
          imported by both sides so the server validates exactly what the client renders
.github/workflows/deploy.yml   Deploys to Boxity hosting (dev branch -> dev, main -> prod)
```

## Run it locally

```bash
# terminal 1 - game server on :2567 (Node 22.9+)
cd server
npm install
cp .env.example .env             # uncomment DEV_PURCHASES=1 for local testing
npm run dev

# terminal 2 - client on :5173
cd client
npm install
cp .env.example .env
npm run dev
```

`DEV_PURCHASES=1` makes every Gems product free so you can test VIP, step packs
and skins. Never set it in production.

Locally the server saves players as JSON files in `server/data/`. Set
`MONGODB_URI` in `server/.env` to use MongoDB instead, as the hosted game does.
The server must be restarted after editing `shared/` (`npm run dev` watches it).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move (camera-relative) |
| Space | Jump. Hold in the air to fly: with WASD you cruise forward almost level, alone you climb |
| Mouse drag / wheel | Orbit / zoom camera |
| E | Use the shop, crate machine, chest, or whatever is in front of you |
| Enter | Chat · Tab: player list · R: rebirth · Esc: close panel |

Touch screens get a joystick, a jump/fly button and drag-to-look.

## Lobbies

Each server room (lobby) holds 8 players (`MAX_CLIENTS`, default 8, in
[server/src/WorldRoom.js](server/src/WorldRoom.js)). When it is full, the next
player gets a new lobby automatically. On Boxity hosting, one pod holds 8 seats
(`seatCap`), and the matchmaker starts another pod when one fills up. The lobby
is sized for 8: shops on the side walls and one row of 6 treadmills (4 normal,
VIP, VIP+).

## Game loop

- **Steps**: you earn steps every 0.4 s you keep moving, or while standing on a
  treadmill (VIP treadmills x2, VIP+ x4). Steps per step =
  `step boost × rebirth multiplier × skin multiplier × x2 pass × treadmill`.
- **Levels**: levels 1-19 use the original game's step thresholds (33, 75, 126 …
  1.3K). Walk speed is `8 + 2 × level` (level 6 → 20, level 7 → 22).
- **Rebirth**: at the level cap (20, then 50, 80, …) rebirth resets you to level 1,
  adds +0.5 to the steps multiplier and raises the cap by 30. "Skip" (Gems) keeps
  your level.
- **Stages** (hand-built in `buildStage()` in [shared/world.js](shared/world.js); every
  gap is sized from the real flight physics so the "Recommended" level and jetpack
  can clear it):
  1. Lava Halls - three big blocks over lava
  2. Haunted Crypt - zig-zag: left box, right box, left box
  3. Ghost Void - a field of boxes; one big ghost (server-simulated, the same for
     every player) hunts whoever is in the room
  4. Frozen Crushers - spiked walls slide out of both side walls and slam together
  5. Toxic Lab - sliding platforms over acid, acid strips, pistons
  6. Crystal Caverns - crystal bridges that appear in a wave
  7. Laser Factory - sideways conveyor belts through timed laser gates
  8. Storm Reactor - lightning strikes the left half, then the right
  9. The Core - crushers, a golden boss ghost, lightning and a launch strip

  Each reward room has a yellow trophy pad and a pink VIP pad (x2). The first clear
  of a stage also pays coins. With `DEV_PURCHASES=1` the Worlds panel has a
  "Go (dev)" button per stage for testing.
- **Jetpacks** (trophies): fuel = flight time. 11 jetpacks from 10 to 45 fuel.
- **Coins**: from pumpkins (Spooky Season event), daily streak, playtime gifts,
  the free chest, races and first clears. Spent on crates (jetpack skins with
  step multipliers) and some trails.
- **Races**: every few minutes, players at level 50+ are invited to a race
  (top 3 win coins).
- **Leaderboards**: lifetime trophies, playtime and rebirths, shown in the lobby.

All of these numbers live in [shared/config.js](shared/config.js).

## Boxity setup

Game id `1-speed-jetpack-escape`, display name "+1 Speed Jetpack Escape".

1. The client's `VITE_GAME_SLUG` and `VITE_BOXITY_HOSTING_ID` are set in
   [client/.env.production](client/.env.production). If the bloxity.io store slug
   is ever different from the game id, change `VITE_GAME_SLUG`.
2. Create a Gems product in the Boxity dashboard for each `sku` in `PRODUCTS`
   ([shared/config.js](shared/config.js)): `x2_steps`, `vip`, `vip_plus`,
   `steps_25k`, `steps_150k`, `steps_2m`, `pulse_jetpack`, `teleport_back`,
   `skip_rebirth`, `moonlit_pulse`, `coins_300`, `coins_1500`.
3. Point the purchase webhook at
   - prod: `https://1-speed-jetpack-escape.host.bloxity.io/api/legion-webhook`
   - dev: `https://1-speed-jetpack-escape.dev.host.bloxity.io/api/legion-webhook`

   The server needs the same secret in `LEGION_WEBHOOK_SECRET`. Without it, every
   webhook gets a 401 and Boxity refunds the Gems.

Logged-in players' tokens are verified against the Boxity API on join. Guests
get a device id; their progress moves to their account the first time they log
in on that device.

## Hosting on Boxity Legion

Pushing to `dev` deploys the dev channel and pushing to `main` deploys prod,
using [.github/workflows/deploy.yml](.github/workflows/deploy.yml):

1. It builds [server/Dockerfile](server/Dockerfile) from the repo root (the server
   imports `shared/`) and pushes it to
   `ghcr.io/<owner>/1-speed-jetpack-escape-server:<channel>-<sha>`.
2. It calls `POST https://legion.bloxity.io/v1/apps/1-speed-jetpack-escape/deploy`
   with that image, the version (commit sha) and `seatCap: 8`.
3. It builds the client and uploads the zip to Boxity frontend hosting:
   - prod: <https://1-speed-jetpack-escape.play.bloxity.io>
   - dev: <https://1-speed-jetpack-escape.dev.play.bloxity.io>

One-time setup:

- **Secret:** add the repository secret `LEGION_DEPLOY_TOKEN` (GitHub → Settings →
  Secrets and variables → Actions). Never commit it.
- **Package visibility:** after the first run, make the GHCR package public (repo →
  Packages → Package settings → Change visibility) so Legion can pull it. Then
  re-run the workflow.

What the server does for hosting:

- Listens on the injected `PORT` and answers `GET /health` instantly.
- Runs as a non-root user (uid 1000).
- Stores players, purchase grants and limited stock in the injected
  `MONGODB_URI`, so every pod sees the same data.
- Purchase webhooks can land on any pod. They are recorded in Mongo by
  `transactionId`, and the pod that holds the buyer applies them within ~3 s. A
  buyer who is offline gets the purchase on their next join.
- On `SIGTERM` (deploy or scale-down) each room locks, tells its players
  "moving you to a fresh server", lets a running race finish (up to 2 min),
  saves everyone, then closes with code 4100. The client re-resolves through
  the matchmaker and lands on a new pod.

The client always joins through the matchmaker (`Legion.SDK.net.resolveEndpoint`)
and never opens a socket to `*.host.bloxity.io`. Those hosts are only for HTTP
calls (webhooks).

Players per pod: `seatCap` in the workflow, `MAX_CLIENTS` on the server and
`VITE_ROOM_SIZE` on the client must all stay 8, or all change together.

## Self-hosting

```bash
cd client && npm run build      # writes client/dist
cd ../server && npm start       # serves client/dist and the game on one port
```

Set `MONGODB_URI` before running more than one server process.
