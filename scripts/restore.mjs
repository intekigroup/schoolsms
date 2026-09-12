// Restores a backup produced by scripts/backup.mjs.
//
//   node scripts/restore.mjs backups/shule-<timestamp>.json.gz --yes
//
// This REPLACES the contents of every table in the backup. It refuses to run
// without --yes, because a restore against the wrong database is exactly the
// kind of mistake a backup is supposed to protect you from.

import { createRequire } from 'node:module'
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const prisma = new PrismaClient()

const file = process.argv[2]
const confirmed = process.argv.includes('--yes')

if (!file) {
  console.error('usage: node scripts/restore.mjs <backup.json.gz> --yes')
  process.exit(1)
}

async function read(path) {
  const chunks = []
  await new Promise((resolve, reject) => {
    createReadStream(path).pipe(createGunzip())
      .on('data', (c) => chunks.push(c))
      .on('end', resolve).on('error', reject)
  })
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// Columns Prisma types as DateTime need real Date objects on the way back in.
const looksLikeDate = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)

function revive(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) out[k] = looksLikeDate(v) ? new Date(v) : v
  return out
}

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`

function quoteValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (v instanceof Date) return sqlString(v.toISOString())
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  // Postgres array literal — e.g. School.levels is an enum[]. Elements are
  // double-quoted inside the braces, with backslashes and quotes escaped.
  if (Array.isArray(v)) {
    const items = v.map((el) => `"${String(el).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    return sqlString(`{${items.join(',')}}`)
  }
  // JSON / composite columns.
  if (typeof v === 'object') return sqlString(JSON.stringify(v))
  return sqlString(v)
}

async function main() {
  const backup = await read(file)
  const tables = Object.entries(backup.tables).filter(([, rows]) => rows.length)
  const totalRows = tables.reduce((n, [, rows]) => n + rows.length, 0)

  console.log(`backup taken ${backup.takenAt}`)
  if (backup.migration) console.log(`schema at migration ${backup.migration}`)
  console.log(`${totalRows} rows across ${tables.length} tables`)

  const live = await prisma.$queryRawUnsafe(`SELECT current_database() AS db`)
  console.log(`target database: ${live[0].db}`)

  if (!confirmed) {
    console.log('\nRefusing to proceed without --yes. Nothing was changed.')
    await prisma.$disconnect()
    return
  }

  const names = Object.keys(backup.tables).filter((t) => backup.tables[t].length >= 0)
  const quoted = names.map((n) => `"${n}"`).join(', ')

  // One transaction: a half-applied restore is worse than none.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)
    for (const [table, rows] of tables) {
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500).map(revive)
        const cols = Object.keys(slice[0]).map((c) => `"${c}"`).join(', ')
        const values = slice
          .map((r) => `(${Object.values(r).map(quoteValue).join(', ')})`)
          .join(', ')
        await tx.$executeRawUnsafe(`INSERT INTO "${table}" (${cols}) VALUES ${values}`)
      }
      console.log(`  ${table.padEnd(20)} ${rows.length}`)
    }
  }, { timeout: 120_000 })

  console.log(`\nrestored ${totalRows} rows`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('restore failed — the transaction rolled back, nothing changed:', e)
  await prisma.$disconnect()
  process.exit(1)
})
