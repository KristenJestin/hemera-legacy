/**
 * The content of the files `ATL-7` changed, before and after its build: the CSV export of Atlas,
 * the same build the build panel's stories draw, in its two repositories. Written to read as the
 * real thing, since a diff is judged on what it shows.
 */

export const QUERY_AFTER = `import { sql } from '../db/sql'
import type { Month } from '../shared/month'

/** One line of the ledger's export: an invoice line, or a credit note as negative amounts. */
export interface ExportRow {
  date: string
  number: string
  client: string
  net: number
  vat: number
  gross: number
  currency: string
  type: 'invoice' | 'credit'
}

const PAGE = 500

/**
 * Every line issued in the month, in issue-date order, streamed a page at a time so that a
 * month of a large client never sits in memory at once.
 */
export async function* exportMonth(month: Month): AsyncGenerator<ExportRow> {
  let after: string | null = null
  for (;;) {
    const page = await sql<ExportRow>\`
      select issued_on as date, number, client_name as client,
             net, vat, gross, currency, kind as type
        from invoice_lines
       where issued_on >= \${month.start} and issued_on < \${month.end}
         and (\${after}::text is null or number > \${after})
       order by issued_on, number
       limit \${PAGE}\`
    for (const row of page) {
      yield row.type === 'credit' ? negate(row) : row
    }
    if (page.length < PAGE) return
    after = page[page.length - 1]!.number
  }
}

/** A credit note is written as the ledger reads it: the same columns, the amounts negative. */
function negate(row: ExportRow): ExportRow {
  return { ...row, net: -row.net, vat: -row.vat, gross: -row.gross }
}

/** The header the ledger expects, in its order. */
export const HEADER = ['date', 'number', 'client', 'net', 'vat', 'gross', 'currency'] as const
`

export const CONTROLLER_BEFORE = `import { Router } from 'express'
import { requireRole } from '../auth/roles'
import { listInvoices } from './invoices.query'

export const billing = Router()

billing.get('/invoices', requireRole('accountant'), async (request, response) => {
  const invoices = await listInvoices(request.query)
  response.json(invoices)
})

billing.get('/invoices/:number', requireRole('accountant'), async (request, response) => {
  const invoice = await listInvoices({ number: request.params.number })
  if (invoice.length === 0) return response.sendStatus(404)
  response.json(invoice[0])
})
`

export const CONTROLLER_AFTER = `import { Router } from 'express'
import { requireRole } from '../auth/roles'
import { toCsv } from '../shared/csv'
import { parseMonth } from '../shared/month'
import { HEADER, exportMonth } from './export.query'
import { listInvoices } from './invoices.query'

export const billing = Router()

billing.get('/invoices', requireRole('accountant'), async (request, response) => {
  const invoices = await listInvoices(request.query)
  response.json(invoices)
})

billing.get('/invoices/:number', requireRole('accountant'), async (request, response) => {
  const invoice = await listInvoices({ number: request.params.number })
  if (invoice.length === 0) return response.sendStatus(404)
  response.json(invoice[0])
})

billing.get('/export', requireRole('accountant'), async (request, response) => {
  const month = parseMonth(request.query.month)
  if (month === null) return response.status(400).send('month is YYYY-MM')
  response.attachment(\`atlas-\${month.key}.csv\`)
  response.type('text/csv')
  for await (const chunk of toCsv(HEADER, exportMonth(month))) response.write(chunk)
  response.end()
})
`

export const CSV_BEFORE = `/** Quotes a field when the ledger would read it as two. */
export function field(value: string | number): string {
  const text = String(value)
  return /[",\\n]/.test(text) ? \`"\${text.replaceAll('"', '""')}"\` : text
}

/** One line of a CSV file, fields separated by commas. */
export function line(values: readonly (string | number)[]): string {
  return values.map(field).join(',') + '\\n'
}
`

export const CSV_AFTER = `/** Quotes a field when the ledger would read it as two. */
export function field(value: string | number): string {
  const text = typeof value === 'number' ? value.toFixed(2) : value
  return /[",\\n;]/.test(text) ? \`"\${text.replaceAll('"', '""')}"\` : text
}

/** One line of a CSV file, fields separated by commas, ended the way the ledger ends them. */
export function line(values: readonly (string | number)[]): string {
  return values.map(field).join(',') + '\\r\\n'
}

/** A whole file as it is written: the header, then one line per row, in the header's order. */
export async function* toCsv<Row extends Record<string, string | number>>(
  header: readonly (keyof Row & string)[],
  rows: AsyncIterable<Row>,
): AsyncGenerator<string> {
  yield line(header)
  for await (const row of rows) yield line(header.map((column) => row[column]!))
}
`

export const API_README_BEFORE = `# Atlas API

The billing and ledger API of Atlas.

## Run it

\`\`\`sh
pnpm install
pnpm dev
\`\`\`

## Routes

- \`GET /billing/invoices\`: the invoices, filtered by the query.
- \`GET /billing/invoices/:number\`: one invoice.
`

export const API_README_AFTER = `# Atlas API

The billing and ledger API of Atlas.

## Run it

\`\`\`sh
pnpm install
pnpm dev
\`\`\`

## Routes

- \`GET /billing/invoices\`: the invoices, filtered by the query.
- \`GET /billing/invoices/:number\`: one invoice.
- \`GET /billing/export?month=YYYY-MM\`: every invoice line of a month as one CSV, in the
  ledger's column order, credit notes as negative rows. See
  [the export](docs/billing/export.md).
`

export const QUERY_TEST_AFTER = `import { describe, expect, test } from 'vitest'
import { seedInvoices } from '../../test/seed'
import { exportMonth } from './export.query'

const SEPTEMBER = { key: '2026-09', start: '2026-09-01', end: '2026-10-01' }

async function all(month = SEPTEMBER) {
  const rows = []
  for await (const row of exportMonth(month)) rows.push(row)
  return rows
}

describe('exporting a month', () => {
  test('an empty month exports no line', async () => {
    await seedInvoices([])
    expect(await all()).toEqual([])
  })

  test('every line issued in the month, by issue date', async () => {
    await seedInvoices([
      { number: 'F-102', issuedOn: '2026-09-14' },
      { number: 'F-101', issuedOn: '2026-09-02' },
      { number: 'F-099', issuedOn: '2026-08-30' },
    ])
    expect((await all()).map((row) => row.number)).toEqual(['F-101', 'F-102'])
  })

  test('a month of 1 200 lines comes in pages, in order', async () => {
    await seedInvoices(
      Array.from({ length: 1200 }, (_, index) => ({
        number: \`F-\${String(index).padStart(4, '0')}\`,
        issuedOn: '2026-09-10',
      })),
    )
    const rows = await all()
    expect(rows).toHaveLength(1200)
    expect(rows.at(-1)!.number).toBe('F-1199')
  })

  test('a credit note is a negative row', async () => {
    await seedInvoices([{ number: 'A-7', issuedOn: '2026-09-20', kind: 'credit', net: 100 }])
    const [row] = await all()
    expect(row).toMatchObject({ type: 'credit', net: -100 })
  })
})
`

export const CREDIT_TEST_AFTER = `import { expect, test } from 'vitest'
import { seedInvoices } from '../../test/seed'
import { exportMonth } from './export.query'

const SEPTEMBER = { key: '2026-09', start: '2026-09-01', end: '2026-10-01' }

test('the file total equals the billing page total for the month', async () => {
  await seedInvoices([
    { number: 'F-201', issuedOn: '2026-09-03', net: 1000, vat: 200, gross: 1200 },
    { number: 'F-202', issuedOn: '2026-09-09', net: 500, vat: 100, gross: 600 },
    { number: 'A-12', issuedOn: '2026-09-21', kind: 'credit', net: 200, vat: 40, gross: 240 },
  ])
  let gross = 0
  for await (const row of exportMonth(SEPTEMBER)) gross += row.gross
  expect(gross).toBe(1560)
})

test('a credit note keeps the number of its own, not its invoice', async () => {
  await seedInvoices([{ number: 'A-13', issuedOn: '2026-09-22', kind: 'credit', invoice: 'F-201' }])
  for await (const row of exportMonth(SEPTEMBER)) expect(row.number).toBe('A-13')
})
`

export const EXPORT_DOC_AFTER = `# Exporting a month

Accountants download every invoice line of a month as one CSV file, to import it into the
ledger without retyping it.

## From the billing page

Pick the month, then **Export CSV**. The file is named after the month: \`atlas-2026-09.csv\`.

## What the file holds

| Column   | What it is                                   |
| -------- | -------------------------------------------- |
| date     | the issue date, \`YYYY-MM-DD\`                 |
| number   | the invoice or credit note number            |
| client   | the client's name as invoiced                |
| net      | the amount before VAT, two decimals          |
| vat      | the VAT, two decimals                        |
| gross    | net plus VAT                                 |
| currency | the ISO code of the currency                 |

A credit note is a row like the others, its amounts negative, so that the file's total is the
month's total on the billing page.

## From the API

\`GET /billing/export?month=2026-09\`, with the \`accountant\` role. A month the API cannot read
answers \`400\`.
`

export const BUTTON_AFTER = `import { useState } from 'react'
import { Button } from '../ui/Button'
import { downloadExport } from './export-csv'

interface ExportButtonProps {
  /** The month shown on the billing page, \`YYYY-MM\`. */
  month: string
}

/** Downloads the month shown as one CSV, and says so while it is on its way. */
export function ExportButton({ month }: ExportButtonProps) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      await downloadExport(month)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="primary" onClick={download} loading={busy}>
      Export CSV
    </Button>
  )
}
`

export const PAGE_BEFORE = `import { MonthPicker } from '../ui/MonthPicker'
import { InvoiceTable } from './InvoiceTable'
import { useInvoices } from './useInvoices'

export function BillingPage() {
  const { month, setMonth, invoices, total } = useInvoices()
  return (
    <main className="billing">
      <header className="billing-head">
        <h1>Billing</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </header>
      <InvoiceTable invoices={invoices} />
      <footer className="billing-total">Total {total}</footer>
    </main>
  )
}
`

export const PAGE_AFTER = `import { MonthPicker } from '../ui/MonthPicker'
import { ExportButton } from './ExportButton'
import { InvoiceTable } from './InvoiceTable'
import { useInvoices } from './useInvoices'

export function BillingPage() {
  const { month, setMonth, invoices, total } = useInvoices()
  return (
    <main className="billing">
      <header className="billing-head">
        <h1>Billing</h1>
        <MonthPicker value={month} onChange={setMonth} />
        <ExportButton month={month} />
      </header>
      <InvoiceTable invoices={invoices} />
      <footer className="billing-total">
        Total {total} <ExportButton month={month} />
      </footer>
    </main>
  )
}
`

export const FRONT_TEST_AFTER = `import { expect, test, vi } from 'vitest'
import { downloadExport } from './export-csv'

test('the header follows the ledger', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response('date,number,client,net,vat,gross,currency\\r\\n'),
  )
  const file = await downloadExport('2026-09', { fetch, save: (name, text) => ({ name, text }) })
  expect(file.text.split('\\r\\n')[0]).toBe('date,number,client,net,vat,gross,currency')
})

test('the file is named after its month', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(''))
  const file = await downloadExport('2026-09', { fetch, save: (name, text) => ({ name, text }) })
  expect(file.name).toBe('atlas-2026-09.csv')
})

test('an export that fails says so and saves nothing', async () => {
  const save = vi.fn()
  const fetch = vi.fn().mockResolvedValue(new Response('month is YYYY-MM', { status: 400 }))
  await expect(downloadExport('2026-13', { fetch, save })).rejects.toThrow('month is YYYY-MM')
  expect(save).not.toHaveBeenCalled()
})
`

export const FRONT_README_BEFORE = `# Atlas

The web application of Atlas.

## Billing

The billing page lists the invoices of a month and their total.
`

export const FRONT_README_AFTER = `# Atlas

The web application of Atlas.

## Billing

The billing page lists the invoices of a month and their total.
**Export CSV** downloads the month as one file for the ledger.
`

/** The client the API's schema generates, one operation per route: a file nobody reads. */
function generatedClient(operations: readonly string[]): string {
  const lines = [
    '/* eslint-disable */',
    '// This file is generated by openapi-typescript-codegen. Do not edit it by hand.',
    '',
    "import { request } from '../core/request'",
    '',
  ]
  for (const operation of operations) {
    lines.push(
      `export async function ${operation}(options: RequestOptions = {}): Promise<unknown> {`,
      `  return request({ method: 'GET', url: '/billing/${operation}', ...options })`,
      '}',
      '',
    )
  }
  return lines.join('\n')
}

const OPERATIONS = ['listInvoices', 'getInvoice', 'listClients', 'getClient', 'listPayments']

export const CLIENT_BEFORE = generatedClient(OPERATIONS)

export const CLIENT_AFTER = generatedClient([...OPERATIONS, 'exportMonth', 'listCreditNotes'])
