import assert from 'node:assert/strict'
import test from 'node:test'
import XLSX from 'xlsx-js-style'
import {
  adjustDecimals,
  buildCellsFn,
  buildModelWorkbook,
  columnIndexFromLabel,
  columnLabel,
} from '../src/lib/spreadsheet.js'
import {
  createWorkbookFormulaEngine,
  renameFormulaSheet,
  syncWorkbookFormulaEngine,
} from '../src/lib/spreadsheetEngine.js'
import { FUNCTION_NAMES } from '../src/lib/spreadsheetFunctions.js'

const model = (grid) => ({
  headers: Array(Math.max(grid[0]?.length - 1, 0)).fill(''),
  rows: grid.map((row) => ({ label: String(row[0] ?? ''), values: row.slice(1).map((value) => String(value ?? '')) })),
  formats: {},
  merges: [],
  colWidths: {},
  rowHeights: {},
  comments: {},
})

test('column labels and decimal formats follow Excel conventions', () => {
  assert.equal(columnLabel(0), 'A')
  assert.equal(columnLabel(25), 'Z')
  assert.equal(columnLabel(26), 'AA')
  assert.equal(columnIndexFromLabel('XFD'), 16383)
  assert.equal(adjustDecimals('0.00%', -1), '0.0%')
  assert.equal(adjustDecimals('0', 2), '0.00')
})

test('function picker exposes the calculation engine rather than a small subset', () => {
  assert.ok(FUNCTION_NAMES.length >= 400)
  for (const name of ['XLOOKUP', 'FILTER', 'XNPV', 'SUMIFS', 'SEQUENCE']) {
    assert.ok(FUNCTION_NAMES.includes(name), `${name} should be available`)
  }
})

test('cell metadata supports checkboxes and notes', () => {
  const cells = buildCellsFn({ '1,2': { t: 'checkbox' } }, { '1,2': 'Reviewed by the analyst' })
  assert.equal(cells(1, 2).type, 'checkbox')
  assert.equal(cells(1, 2).comment.value, 'Reviewed by the analyst')
})

test('one formula engine calculates and rewrites cross-sheet references', () => {
  let sheets = [
    { name: 'Inputs', model: model([['2']]) },
    { name: 'Forecast', model: model([['=Inputs!A1*3']]) },
  ]
  const engine = createWorkbookFormulaEngine(sheets)
  assert.equal(engine.getCellValue({ sheet: engine.getSheetId('Forecast'), row: 0, col: 0 }), 6)

  sheets = sheets.map((sheet) => sheet.name === 'Inputs' ? { ...sheet, name: 'Assumptions' } : sheet)
  sheets = renameFormulaSheet(engine, 'Inputs', 'Assumptions', sheets)
  assert.equal(sheets[1].model.rows[0].label, '=Assumptions!A1*3')
  assert.equal(engine.getCellValue({ sheet: engine.getSheetId('Forecast'), row: 0, col: 0 }), 6)

  const replacement = sheets.map((sheet) => sheet.name === 'Assumptions'
    ? { ...sheet, model: model([['4']]) }
    : sheet)
  syncWorkbookFormulaEngine(engine, replacement)
  assert.equal(engine.getCellValue({ sheet: engine.getSheetId('Forecast'), row: 0, col: 0 }), 12)
  engine.destroy()
})

test('xlsx export keeps formulas, numeric values, styles, dimensions, merges, and hidden sheets', () => {
  const styled = model([['Revenue', '1250'], ['Margin', '=B1/2500']])
  styled.formats = {
    '0,0': { b: true, c: '#ffffff', bg: '#217346', a: 'center', bd: { b: true }, link: 'https://example.com/model' },
    '0,1': { nf: '0,0.00' },
    '1,1': { nf: '0.00%' },
  }
  styled.merges = [{ row: 1, col: 0, rowspan: 1, colspan: 1 }]
  styled.colWidths = { 0: 160, 1: 110 }
  styled.rowHeights = { 0: 28 }
  styled.comments = { '0,1': 'Imported assumption' }
  const workbook = buildModelWorkbook([
    { name: 'Model', model: styled },
    { name: 'Hidden inputs', hidden: true, model: model([['1']]) },
  ])

  assert.equal(workbook.Sheets.Model.B1.t, 'n')
  assert.equal(workbook.Sheets.Model.B1.v, 1250)
  assert.equal(workbook.Sheets.Model.B2.f, 'B1/2500')
  assert.equal(workbook.Sheets.Model.A1.s.font.bold, true)
  assert.equal(workbook.Sheets.Model.A1.s.fill.fgColor.rgb, 'FF217346')
  assert.equal(workbook.Sheets.Model.A1.l.Target, 'https://example.com/model')
  assert.equal(workbook.Sheets.Model.B1.c[0].t, 'Imported assumption')
  assert.equal(workbook.Sheets.Model['!cols'][0].wpx, 160)
  assert.equal(workbook.Sheets.Model['!rows'][0].hpx, 28)
  assert.equal(workbook.Workbook.Sheets[1].Hidden, 1)

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
  const reopened = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellStyles: true, cellNF: true })
  assert.equal(reopened.Sheets.Model.B2.f, 'B1/2500')
  assert.equal(reopened.Sheets.Model.A1.l.Target, 'https://example.com/model')
  assert.equal(reopened.Sheets.Model.B1.c[0].t, 'Imported assumption')
  assert.equal(reopened.Workbook.Sheets[1].Hidden, 1)
})
