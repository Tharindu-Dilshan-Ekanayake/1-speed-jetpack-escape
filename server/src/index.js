import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { matchMaker, Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import cors from 'cors'
import express from 'express'

import { PUBLIC_PARTY, ROOM_NAME } from '../../shared/net.js'
import { verifyBloxityToken } from './auth.js'
import { installStatReporter } from './stats.js'
import { store } from './store.js'
import { WorldRoom } from './WorldRoom.js'

const PORT = Number(process.env.PORT) || 2567
const REGION = process.env.REGION || 'default'
/** Boxity hosting names each pod; handy in logs and the rooms list. */
const POD = process.env.POD_NAME || os.hostname()
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')

// Vite's dev server origin. Add the production origin here (or via
// ALLOWED_ORIGINS=a,b) when you deploy the client somewhere else.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Boxity hosting injects the game site's origin.
  ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
  ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
]

const gameServer = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    app.use('/api', cors({ origin: ALLOWED_ORIGINS, credentials: true }))
    app.use('/api', express.json({ limit: '64kb' }))

    // Boxity hosting polls GET /health; keep both answering instantly.
    app.get(['/health', '/api/health'], (_req, res) => res.json({ ok: true }))

    /**
     * Open rooms for the Boxity game page ("hosted elsewhere" format). Point
     * the game's allRoomsUrl at this. Covers this process; behind several
     * processes, aggregate them in front of this endpoint.
     */
    app.get('/api/rooms', cors(), async (_req, res) => {
      const rooms = await matchMaker.query({ name: ROOM_NAME })
      const list = rooms.map((r) => ({
        id: r.roomId,
        region: REGION,
        // Party rooms only take that party (partyKey filter value lives in metadata).
        type: r.private || (r.metadata?.partyKey && r.metadata.partyKey !== PUBLIC_PARTY) ? 'private' : 'public',
        players: r.clients,
        maxPlayers: r.maxClients,
        locked: !!r.locked,
      }))
      res.json({
        rooms: list,
        onlineServers: [{ id: POD, region: REGION, rooms: list.length, players: list.reduce((n, r) => n + r.players, 0) }],
      })
    })

    /**
     * Auth passthrough for `Legion.SDK.auth.authenticateWithServer('/api/legion-auth')`.
     * The token is verified against Boxity before anything in the body is trusted.
     */
    app.post('/api/legion-auth', async (req, res) => {
      const verified = await verifyBloxityToken(req.body?.token)
      if (!verified) return res.status(401).json({ error: 'invalid token' })
      const { user } = verified
      res.json({ user: { legionId: user._id || user.id, username: user.username, displayName: user.displayName } })
    })

    // Production: serve the built client from the same origin.
    if (fs.existsSync(CLIENT_DIST)) {
      app.use(express.static(CLIENT_DIST, { index: 'index.html', maxAge: '1h' }))
      app.get(/^\/(?!api\/|matchmake\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')))
    }
  },
})

// Party members carry the same partyKey and only ever match each other's room.
gameServer.define(ROOM_NAME, WorldRoom).filterBy(['partyKey'])

const flushStats = installStatReporter()
// Runs after every room has drained (see WorldRoom.onBeforeShutdown).
gameServer.onShutdown(async () => {
  await flushStats?.()
  await store.close()
})

await gameServer.listen(PORT)
console.log(`[server] +1 Speed Jetpack Escape listening on :${PORT} (${process.env.BLOXITY_CHANNEL || 'local'}, pod ${POD}, ${store.kind} store)`)
if (process.env.DEV_PURCHASES === '1') console.log('[server] DEV_PURCHASES=1 - shop items are free (never enable in production)')
