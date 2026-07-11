import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'

// File-backed store for user-created theses. Deliberately simple — a JSON file
// under the project's data/ dir — so the app persists new theses across restarts
// without pulling in a database. Sample/seed theses still live in src/data.
const DATA_DIR = path.join(process.cwd(), 'data')
const STORE_PATH = path.join(DATA_DIR, 'user-theses.json')

// Serialise writes so two concurrent creates can't read-modify-write over each
// other and lose a record.
let writeChain = Promise.resolve()

async function readAll() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    if (e.code === 'ENOENT') return [] // no file yet — empty store
    throw e
  }
}

async function writeAll(list) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(STORE_PATH, JSON.stringify(list, null, 2), 'utf8')
}

// Newest first.
export async function listTheses() {
  return readAll()
}

export async function getThesis(id) {
  const all = await readAll()
  return all.find((t) => String(t.id) === String(id)) || null
}

// Assigns the next id and prepends the record. Returns the saved record.
export async function addThesis(thesis) {
  const result = writeChain.then(async () => {
    const all = await readAll()
    const id = all.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1
    const record = { ...thesis, id }
    await writeAll([record, ...all])
    return record
  })
  // Keep the chain alive even if this write rejects.
  writeChain = result.catch(() => {})
  return result
}
