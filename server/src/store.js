import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Persistence, behind one async interface with two backends:
 *
 *  - MongoDB, when MONGODB_URI is set. Boxity hosting injects it: an isolated
 *    managed database for this game + channel, shared by every pod - which is
 *    what lets several pods agree on player data. Saves are kept forever, so
 *    a player who comes back months later continues where they stopped.
 *  - JSON files in server/data, for local development (one process only).
 *
 * Collections: profiles (_id = profile id) and counters (limited stock).
 */

/* ------------------------------------------------------------------------ */
/* MongoDB                                                                   */
/* ------------------------------------------------------------------------ */

const fromDoc = (doc) => {
  if (!doc) return null
  const { _id, ...rest } = doc
  return { ...rest, id: _id }
}
const toDoc = (profile) => {
  const { id, ...rest } = profile
  return { _id: id, ...rest }
}

async function mongoStore(uri) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(uri, { maxPoolSize: 10 })
  await client.connect()
  // The database named in MONGODB_URI (Boxity's managed URI names this game's).
  const db = client.db(process.env.MONGODB_DB || undefined)
  const profiles = db.collection('profiles')
  const counters = db.collection('counters')
  await Promise.all([
    profiles.createIndex({ trophiesEarned: -1 }),
    profiles.createIndex({ playtime: -1 }),
    profiles.createIndex({ rebirths: -1, level: -1 }),
  ])
  console.log('[store] using MongoDB')

  return {
    kind: 'mongo',
    async load(id) {
      return fromDoc(await profiles.findOne({ _id: id }))
    },
    async save(profile) {
      await profiles.replaceOne({ _id: profile.id }, toDoc(profile), { upsert: true })
    },
    async top(sortField, limit = 10) {
      const sort = sortField === 'rebirths' ? { rebirths: -1, level: -1 } : { [sortField]: -1 }
      const docs = await profiles
        .find({ [sortField]: { $gt: 0 }, mergedInto: { $exists: false } }, { projection: { name: 1, pfp: 1, trophiesEarned: 1, playtime: 1, rebirths: 1, level: 1 } })
        .sort(sort)
        .limit(limit)
        .toArray()
      return docs.map(fromDoc)
    },
    async getStock(key, initial) {
      const doc = await counters.findOneAndUpdate({ _id: key }, { $setOnInsert: { value: initial } }, { upsert: true, returnDocument: 'after' })
      return doc?.value ?? initial
    },
    /** Takes one unit of limited stock if any is left. */
    async takeStock(key, initial) {
      await this.getStock(key, initial)
      const res = await counters.updateOne({ _id: key, value: { $gt: 0 } }, { $inc: { value: -1 } })
      return res.modifiedCount === 1
    },
    async giveBackStock(key) {
      await counters.updateOne({ _id: key }, { $inc: { value: 1 } })
    },
    async close() {
      await client.close()
    },
  }
}

/* ------------------------------------------------------------------------ */
/* JSON files (local development)                                            */
/* ------------------------------------------------------------------------ */

function fileStore() {
  const dir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
  fs.mkdirSync(dir, { recursive: true })
  const PROFILES = path.join(dir, 'profiles.json')
  const GLOBAL = path.join(dir, 'global.json')
  const read = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`[store] could not read ${file}:`, err.message)
      return fallback
    }
  }
  // Write to a temp file then rename, so a crash mid-write never truncates the data.
  const write = (file, data) => {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data))
    fs.renameSync(`${file}.tmp`, file)
  }

  const profiles = new Map(Object.entries(read(PROFILES, {})))
  const global = { counters: {}, ...read(GLOBAL, {}) }
  let timer = null
  const flush = () => {
    clearTimeout(timer)
    timer = null
    try {
      write(PROFILES, Object.fromEntries(profiles))
      write(GLOBAL, global)
    } catch (err) {
      console.error('[store] save failed:', err)
    }
  }
  const later = () => {
    if (!timer) timer = setTimeout(flush, 3000)
  }
  const clone = (v) => (v ? structuredClone(v) : null)
  console.log(`[store] using JSON files in ${dir} (${profiles.size} profiles)`)

  return {
    kind: 'file',
    async load(id) {
      return clone(profiles.get(id))
    },
    async save(profile) {
      profiles.set(profile.id, clone(profile))
      later()
    },
    async top(sortField, limit = 10) {
      const score = sortField === 'rebirths' ? (p) => p.rebirths * 1e6 + p.level : (p) => p[sortField] || 0
      return [...profiles.values()]
        .filter((p) => score(p) > 0 && !p.mergedInto)
        .sort((a, b) => score(b) - score(a))
        .slice(0, limit)
        .map(clone)
    },
    async getStock(key, initial) {
      if (global.counters[key] === undefined) global.counters[key] = initial
      return global.counters[key]
    },
    async takeStock(key, initial) {
      if ((await this.getStock(key, initial)) <= 0) return false
      global.counters[key] -= 1
      later()
      return true
    },
    async giveBackStock(key) {
      global.counters[key] = (global.counters[key] ?? 0) + 1
      later()
    },
    async close() {
      flush()
    },
  }
}

export const store = process.env.MONGODB_URI ? await mongoStore(process.env.MONGODB_URI) : fileStore()
