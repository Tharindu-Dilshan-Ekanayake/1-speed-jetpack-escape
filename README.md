# +1 Speed Jetpack Escape

A browser remake of the Roblox simulator: every step makes you faster, jetpacks
carry you over lava and voids, and you escape 9 stages for **Wins**. Multiplayer
runs on [Colyseus](https://colyseus.io); login and avatars come from the Boxity
(Bloxity) SDK, and the game is hosted on Boxity Legion. Everything in the game is
bought with Wins earned by playing. There is no real-money currency.

```
client/   React + three.js (react-three-fiber) game client, Vite
server/   Colyseus 0.18 game server + Express API (auth passthrough)
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

The game opens straight into the lobby. There is no title screen. A player with
a Boxity account joins as themselves; anyone else joins as a guest, and their
progress is kept on that device. There is no log-out.

`DEV_PURCHASES=1` makes shop items free and adds a "Go (dev)" button per stage in
Worlds. Never set it in production.

Locally the server saves players as JSON files in `server/data/`. Set
`MONGODB_URI` in `server/.env` to use MongoDB instead, as the hosted game does.
The server must be restarted after editing `shared/` (`npm run dev` watches it).

## Controls

| Key | Action |
| --- | --- |
| W / S | Forward / back |
| A / D | Turn (the camera turns with you, on the ground and in the air) |
| Space | Jump. Hold in the air to fly: with W you cruise forward, alone you climb |
| Mouse drag / wheel | Look around / zoom |
| E | Use / buy whatever is in front of you |
| R · T · B | Rebirth · Worlds · Shop |
| O · M | Settings · sound on/off |
| Z · X · C | Slower · faster · full speed (speed limiter) |
| Tab · Enter · Esc | Player list · chat · close |

Every HUD button shows its key in its top-left corner. Touch screens get a
joystick, a JUMP/FLY button and drag-to-look. The whole HUD scales with the window,
so a phone or a small window gets the same layout, smaller.

## The HUD

- **Left:** Wins, Coins, Rebirths, then the Rebirth / Worlds / Shop buttons.
- **Right:** Settings and Sound, the daily quests, and the speed limiter
  (bottom-right).
- **Bottom:** step multipliers, the x2 boost timer, the squad bonus, the level
  bar and the fuel bar.
- **Shop** tabs: Shop (Wins items), Skins (jetpack skins and jetpacks) and Trails.

## Game loop

- **Steps and levels**: you earn steps every 0.4 s you keep moving, or while
  standing on a treadmill (VIP x2, VIP+ x4). Levels 1-19 use the original game's
  thresholds (33, 75, 126 … 1.3K). Walk speed is `8 + 2 × level`.
- **Rebirth**: at the level cap (20, then 50, 80, …) rebirth resets you to level
  1, adds +0.5 to the steps multiplier and raises the cap by 30. "Skip" (Wins)
  keeps your level.
- **Stages** (hand-built in `buildStage()` in [shared/world.js](shared/world.js); every
  gap is sized from the real flight physics):
  1. Lava Halls - three big blocks over lava
  2. Haunted Crypt - zig-zag: left box, right box, left box
  3. Ghost Void - a field of boxes; one big ghost (the same for every player) hunts you
  4. Frozen Crushers - walls slide out of both sides and slam together
  5. Toxic Lab - sliding platforms over acid, acid strips, pistons
  6. Crystal Caverns - crystal bridges that appear in a wave
  7. Laser Factory - sideways conveyor belts through timed laser gates
  8. Storm Reactor - lightning strikes the left half, then the right
  9. The Core - crushers, a golden boss ghost, lightning and a launch strip
- **Wins**: the yellow pad at the end of each stage pays the stage's Wins, and
  the pink VIP pad pays double. Wins buy jetpacks, step boosts, passes (x2, VIP,
  VIP+), step packs, Skip Rebirth, the limited Moonlit Pulse skin and coin packs.
- **Coins**: spinning coins along every stage path (a row on each platform, a
  line across each big gap), worth more on later stages and back on every run.
  There are also daily rewards, playtime gifts, the free chest, races and first
  clears. Coins buy crates (jetpack skins with step multipliers) and some trails.
- **Leaderboards**: lifetime Wins, playtime and rebirths, shown in the lobby.

All of these numbers live in [shared/config.js](shared/config.js).

## Keeping players

- **Continue where you stopped**: progress (level, Wins, items) is saved on the
  server and kept forever. Leave in the middle of Stage 3 and you come back in
  Stage 3, days or months later.
- **First-time guide**: five steps with a 3D arrow:
  1. run to earn steps;
  2. go through the Stage 1 door;
  3. fly over the lava;
  4. step on the Wins pad;
  5. buy Jetpack 2 for 3 Wins.
- **Starter boost**: new players get x2 steps for 15 minutes.
- **Welcome back**: after a day away you get coins (more the longer you were
  gone) and x2 steps for 10 minutes.
- **Daily quests**: three a day (steps, coins, escapes, treadmill, flying,
  pumpkins, races), paid automatically. Finishing all three adds coins and x2
  steps.
- **Squad bonus**: +10% steps for every other player in your server (up to
  +50%), and invites in the Worlds panel.
- **Automatic rewards**: the daily streak, playtime gifts and Spooky event
  rewards claim themselves.
- **Everyone sees everything**: level-ups, rebirths, Wins, purchases, quests and
  coin grabs show over the player's head for the whole server.

## Graphics and performance

Every graphics setting renders at full screen resolution (sharper on high-DPI
screens):

| Setting | Glow (bloom) | Shadow map | Point lights | Max resolution |
| --- | --- | --- | --- | --- |
| Low | off | 1024 | 2 | 1× |
| Medium | on | 1536 | 3 | 1.25× |
| High | on | 2048 | 4 | 1.5× |

- **Room culling:** only the room you are in and its neighbours are drawn (every
  room is enclosed), so a stage costs about 20-30K triangles and 60-150 draw calls.
- **Auto performance** (on by default): if frames drop, the game first lowers any
  above-native resolution, then switches to a light mode (no glow, no shadows)
  rather than blurring the picture. Turn it off in Settings to keep the full look.

## Boxity setup

Game id `1-speed-jetpack-escape`, display name "+1 Speed Jetpack Escape".
[client/.env.production](client/.env.production) sets `VITE_GAME_SLUG` and
`VITE_BOXITY_HOSTING_ID`. Logged-in players' tokens are verified against the
Boxity API on join. A guest's progress moves to their account the first time
they log in on that device.

## Hosting on Boxity Legion

Pushing to `dev` deploys the dev channel and pushing to `main` deploys prod,
using [.github/workflows/deploy.yml](.github/workflows/deploy.yml):

1. It builds [server/Dockerfile](server/Dockerfile) from the repo root and
   pushes it to `ghcr.io/<owner>/1-speed-jetpack-escape-server:<channel>-<sha>`.
2. It calls `POST https://legion.bloxity.io/v1/apps/1-speed-jetpack-escape/deploy`
   with that image, the version (commit sha) and `seatCap: 8`.
3. It builds the client and uploads the zip to Boxity frontend hosting:
   - prod: <https://1-speed-jetpack-escape.play.bloxity.io>
   - dev: <https://1-speed-jetpack-escape.dev.play.bloxity.io>

One-time setup:

- **Secret:** add the repository secret `LEGION_DEPLOY_TOKEN` (GitHub → Settings →
  Secrets and variables → Actions). Never commit it.
- **Package visibility:** after the first run, make the GHCR package public (repo →
  Packages → Package settings → Change visibility), then re-run the workflow.

What the server does for hosting:

- Listens on the injected `PORT` and answers `GET /health` instantly.
- Runs as a non-root user (uid 1000).
- Stores players and limited stock in the injected `MONGODB_URI`, so every pod
  shares the same data.
- On `SIGTERM` (deploy or scale-down) each room locks, tells its players
  "moving you to a fresh server", lets a running race finish (up to 2 min),
  saves everyone, then closes with code 4100. The client re-resolves through
  the matchmaker and lands on a new pod, in the same stage they were in.

The client always joins through the matchmaker (`Legion.SDK.net.resolveEndpoint`)
and never opens a socket to `*.host.bloxity.io`.

Players per pod: `seatCap` in the workflow, `MAX_CLIENTS` on the server and
`VITE_ROOM_SIZE` on the client must all stay 8, or all change together.

## Self-hosting

```bash
cd client && npm run build      # writes client/dist
cd ../server && npm start       # serves client/dist and the game on one port
```

Set `MONGODB_URI` before running more than one server process.
