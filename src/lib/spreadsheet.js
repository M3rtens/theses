import XLSX from 'xlsx-js-style'
import { normalizePublicUrl } from './urls.js'

// Shared spreadsheet helpers used by both the editor and the read-only viewer so
// a saved model renders identically in both. The persisted per-sheet model shape
// is:
//
//   {
//     headers: string[],                 // length = columnCount - 1
//     rows: [{ label, values: string[] }],
//     formats?: { "<row>,<col>": CellFormat },   // sparse, grid coords (col 0 = label)
//     merges?:  [{ row, col, rowspan, colspan }],
//     colWidths?: { "<col>": px },        // sparse
//   }
//
// CellFormat = { b?, i?, u?, a?('left'|'center'|'right'), c?(text colour),
//                bg?(fill), nf?(numbro pattern), bd?({ t,r,b,l booleans }),
//                t?('checkbox'), link?(hyperlink target) }
//
// Formatting is the single source of truth in the model — it round-trips through
// save/reload rather than living only in Handsontable's runtime cell meta.

export const DEFAULT_COL_WIDTH = 104

// 0 → A, 25 → Z, 26 → AA …
export const columnLabel = (index) => {
  let label = ''
  let value = index + 1
  while (value > 0) {
    value -= 1
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26)
  }
  return label
}

// "A" → 0 (inverse of columnLabel).
export const columnIndexFromLabel = (label) => {
  let value = 0
  for (const character of label.toUpperCase()) value = value * 26 + character.charCodeAt(0) - 64
  return value - 1
}

export const cellKey = (row, col) => `${row},${col}`

// Curated numbro patterns for the Number ribbon group, keyed by a short id.
export const NUMBER_FORMATS = {
  general: null,
  number: '0.00',
  integer: '0',
  comma: '0,0.00',
  currency: '$0,0.00',
  accounting: '$ 0,0.00',
  percent: '0.00%',
  scientific: '0.00e+0',
}

// numbro pattern → Excel number-format code, so a saved format survives export to
// a real .xlsx (SheetJS writes the `z` code on the cell).
const NUMBRO_TO_EXCEL_Z = {
  '0.00': '0.00',
  '0': '0',
  '0,0.00': '#,##0.00',
  '$0,0.00': '$#,##0.00',
  '$ 0,0.00': '$\\ #,##0.00',
  '0.00%': '0.00%',
  '0.00e+0': '0.00E+00',
}

const EXCEL_TO_NUMBRO_Z = Object.fromEntries(
  Object.entries(NUMBRO_TO_EXCEL_Z).map(([numbro, excel]) => [excel, numbro]),
)

export const numbroToExcelZ = (pattern) => NUMBRO_TO_EXCEL_Z[pattern] || undefined
export const excelZToNumbro = (pattern) => EXCEL_TO_NUMBRO_Z[pattern] || undefined

// Increase/decrease the decimal count of a numbro pattern (used by the ± decimal
// buttons). Falls back sensibly when the pattern has no decimals yet.
export const adjustDecimals = (pattern, delta) => {
  const base = pattern || '0'
  const [intPart, decPart = ''] = base.split('.')
  const nextCount = Math.max(0, decPart.replace(/[^0]/g, '').length + delta)
  const suffix = decPart.replace(/0+/, '') // keep a trailing % or e+0 marker
  if (nextCount === 0) return intPart + suffix
  return `${intPart}.${'0'.repeat(nextCount)}${suffix}`
}

// Translate a persisted CellFormat into Handsontable cell properties. Colours and
// borders are carried on `_fmt` for applyCellStyle (afterRenderer) to paint,
// since they can't be expressed as cell properties directly.
export const formatToCellProps = (fmt, note) => {
  if (!fmt && !note) return {}
  fmt ||= {}
  const classes = []
  if (fmt.b) classes.push('cell-bold')
  if (fmt.i) classes.push('cell-italic')
  if (fmt.a === 'left') classes.push('htLeft')
  if (fmt.a === 'center') classes.push('htCenter')
  if (fmt.a === 'right') classes.push('htRight')
  if (fmt.va === 'top') classes.push('htTop')
  if (fmt.va === 'middle') classes.push('htMiddle')
  if (fmt.va === 'bottom') classes.push('htBottom')
  if (fmt.w) classes.push('cell-wrap')
  const props = { _fmt: fmt }
  if (fmt.w) props.wordWrap = true
  if (classes.length) props.className = classes.join(' ')
  if (fmt.t === 'checkbox') {
    props.type = 'checkbox'
  } else if (fmt.nf) {
    props.type = 'numeric'
    props.numericFormat = { pattern: fmt.nf, culture: 'en-US' }
  }
  if (note) props.comment = { value: note }
  return props
}

// A Handsontable `cells` callback that applies a sheet's persisted formats.
export const buildCellsFn = (formats, notes) => (row, col) => {
  const key = cellKey(row, col)
  return formatToCellProps(formats?.[key], notes?.[key])
}

// Paint colours and borders from a cell's `_fmt` (call inside afterRenderer).
// Always assigns (including empty strings) so a cleared format resets the
// previous paint back to the grid's default styling.
const CELL_BORDER = '1.5px solid #555'
export const applyCellStyle = (td, cellProperties) => {
  const fmt = cellProperties?._fmt
  td.style.backgroundColor = fmt?.bg || ''
  td.style.color = fmt?.c || (fmt?.link ? '#0563c1' : '')
  td.style.fontFamily = fmt?.ff || ''
  td.style.fontSize = fmt?.fs ? `${fmt.fs}px` : ''
  // Underline and strikethrough share text-decoration, so combine them here
  // rather than as competing classes.
  const decoration = [(fmt?.u || fmt?.link) && 'underline', fmt?.s && 'line-through'].filter(Boolean).join(' ')
  td.style.textDecoration = decoration || ''
  td.style.cursor = fmt?.link ? 'pointer' : ''
  td.title = fmt?.link || ''
  td.style.borderTop = fmt?.bd?.t ? CELL_BORDER : ''
  td.style.borderRight = fmt?.bd?.r ? CELL_BORDER : ''
  td.style.borderBottom = fmt?.bd?.b ? CELL_BORDER : ''
  td.style.borderLeft = fmt?.bd?.l ? CELL_BORDER : ''
}

// A colWidths callback backed by the sparse persisted map.
export const buildColWidthsFn = (colWidths) => (index) =>
  colWidths?.[index] ?? DEFAULT_COL_WIDTH

export const DEFAULT_ROW_HEIGHT = 23

// A rowHeights callback backed by the sparse persisted map.
export const buildRowHeightsFn = (rowHeights) => (index) =>
  rowHeights?.[index] ?? DEFAULT_ROW_HEIGHT

// Normalise the persisted merges into the array Handsontable expects (always a
// fresh array so the plugin re-applies on updateSettings).
export const mergesFor = (merges) =>
  Array.isArray(merges) ? merges.map((m) => ({ ...m })) : []

const toGrid = (model) => model.rows.map((row) => [row.label, ...row.values])

const colorToArgb = (value) => {
  const hex = String(value || '').replace('#', '').toUpperCase()
  if (!/^[0-9A-F]{6}$/.test(hex)) return undefined
  return `FF${hex}`
}

const xlsxStyleFor = (fmt) => {
  if (!fmt) return undefined
  const style = {}
  const fontColor = colorToArgb(fmt.c)
  if (fmt.b || fmt.i || fmt.u || fmt.s || fmt.ff || fmt.fs || fontColor || fmt.link) {
    style.font = {
      ...(fmt.b ? { bold: true } : {}),
      ...(fmt.i ? { italic: true } : {}),
      ...(fmt.u || fmt.link ? { underline: true } : {}),
      ...(fmt.s ? { strike: true } : {}),
      ...(fmt.ff ? { name: fmt.ff } : {}),
      ...(fmt.fs ? { sz: Number(fmt.fs) } : {}),
      ...(fontColor ? { color: { rgb: fontColor } } : fmt.link ? { color: { rgb: 'FF0563C1' } } : {}),
    }
  }
  const fillColor = colorToArgb(fmt.bg)
  if (fillColor) style.fill = { patternType: 'solid', fgColor: { rgb: fillColor } }
  if (fmt.a || fmt.va || fmt.w) {
    style.alignment = {
      ...(fmt.a ? { horizontal: fmt.a } : {}),
      ...(fmt.va ? { vertical: fmt.va === 'middle' ? 'center' : fmt.va } : {}),
      ...(fmt.w ? { wrapText: true } : {}),
    }
  }
  if (fmt.bd) {
    style.border = {}
    const border = { style: 'thin', color: { rgb: 'FF595959' } }
    if (fmt.bd.t) style.border.top = border
    if (fmt.bd.r) style.border.right = border
    if (fmt.bd.b) style.border.bottom = border
    if (fmt.bd.l) style.border.left = border
  }
  const numberFormat = numbroToExcelZ(fmt.nf)
  if (numberFormat) style.numFmt = numberFormat
  return Object.keys(style).length ? style : undefined
}

const typedCellValue = (value) => {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return Number(text)
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true'
  return value
}

// Build and download a real .xlsx workbook from the model. The style-capable
// SheetJS build lets the persisted in-app format map round-trip into Excel.
export const buildModelWorkbook = (sheets) => {
  const workbook = XLSX.utils.book_new()
  sheets.forEach(({ name, model: sheetModel }) => {
    const grid = toGrid(sheetModel).map((row) => row.map(typedCellValue))
    const sheet = XLSX.utils.aoa_to_sheet(grid)
    const formats = sheetModel.formats || {}
    const notes = sheetModel.comments || {}

    grid.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
      const text = String(value ?? '')
      if (text.startsWith('=')) {
        sheet[address] = { t: 'n', f: text.slice(1) }
      }
      const fmt = formats[cellKey(rowIndex, colIndex)]
      const style = xlsxStyleFor(fmt)
      if (style) {
        if (!sheet[address]) sheet[address] = { t: 's', v: '' }
        sheet[address].s = style
      }
      const z = numbroToExcelZ(fmt?.nf)
      if (z && sheet[address]) sheet[address].z = z
      const safeLink = normalizePublicUrl(fmt?.link)
      if (safeLink) {
        if (!sheet[address]) sheet[address] = { t: 's', v: '' }
        sheet[address].l = { Target: safeLink }
      }
      const note = notes[cellKey(rowIndex, colIndex)]
      if (note) {
        if (!sheet[address]) sheet[address] = { t: 's', v: '' }
        sheet[address].c = [{ a: 'Theses', t: note }]
      }
    }))

    const merges = mergesFor(sheetModel.merges)
    if (merges.length) {
      sheet['!merges'] = merges.map((m) => ({
        s: { r: m.row, c: m.col },
        e: { r: m.row + m.rowspan - 1, c: m.col + m.colspan - 1 },
      }))
    }

    const colWidths = sheetModel.colWidths
    if (colWidths && Object.keys(colWidths).length) {
      const maxCol = grid.reduce((max, row) => Math.max(max, row.length), 0)
      sheet['!cols'] = Array.from({ length: maxCol }, (_, index) => ({
        wpx: colWidths[index] ?? DEFAULT_COL_WIDTH,
      }))
    }

    const rowHeights = sheetModel.rowHeights
    if (rowHeights && Object.keys(rowHeights).length) {
      sheet['!rows'] = Array.from({ length: grid.length }, (_, index) => ({
        hpx: rowHeights[index] ?? DEFAULT_ROW_HEIGHT,
      }))
    }

    XLSX.utils.book_append_sheet(workbook, sheet, name)
  })
  workbook.Workbook ||= {}
  workbook.Workbook.Sheets = sheets.map((sheet) => ({
    name: sheet.name,
    Hidden: sheet.hidden ? 1 : 0,
  }))
  return workbook
}

export const exportModelToXlsx = (sheets, fileName, defaultName = 'model.xlsx') => {
  const workbook = buildModelWorkbook(sheets)
  const exportName = String(fileName || '').trim() || defaultName
  XLSX.writeFile(workbook, /\.xlsx$/i.test(exportName) ? exportName : `${exportName}.xlsx`)
}
