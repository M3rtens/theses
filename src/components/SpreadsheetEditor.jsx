'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HotTable } from '@handsontable/react-wrapper'
import { registerAllModules } from 'handsontable/registry'
import XLSX from 'xlsx-js-style'
import { normalizePublicUrl } from '../lib/urls.js'
import {
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  NUMBER_FORMATS,
  adjustDecimals,
  applyCellStyle,
  buildCellsFn,
  buildColWidthsFn,
  buildRowHeightsFn,
  cellKey,
  columnIndexFromLabel,
  columnLabel,
  excelZToNumbro,
  exportModelToXlsx,
  mergesFor,
} from '../lib/spreadsheet.js'
import { FUNCTION_INDEX, FUNCTION_LIBRARY, FUNCTION_NAMES } from '../lib/spreadsheetFunctions.js'
import {
  createWorkbookFormulaEngine,
  gridFromSheetModel,
  renameFormulaSheet,
  serializeWorkbookFormulaEngine,
  syncWorkbookFormulaEngine,
} from '../lib/spreadsheetEngine.js'
import 'handsontable/styles/handsontable.min.css'
import 'handsontable/styles/ht-theme-main.min.css'

registerAllModules()

const DEFAULT_FILE_NAME = 'model.xlsx'
const DEFAULT_ROWS = 30
const DEFAULT_COLUMNS = 12

const FONT_FAMILIES = ['Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New', 'JetBrains Mono']
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36]
const DEFAULT_FONT_SIZE = 11

// Number-format dropdown, mirroring Excel's Number group list.
const NUMBER_FORMAT_OPTIONS = [
  ['general', 'General'],
  ['number', 'Number'],
  ['currency', 'Currency'],
  ['accounting', 'Accounting'],
  ['percent', 'Percentage'],
  ['comma', 'Comma'],
  ['scientific', 'Scientific'],
]

const FORMULA_RIBBON_GROUPS = [
  ['Financial', ['PV', 'FV', 'NPV', 'XNPV', 'IRR', 'MIRR', 'PMT']],
  ['Logical', ['IF', 'IFS', 'AND', 'OR', 'IFERROR', 'SWITCH']],
  ['Text', ['CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'LEN', 'TEXT', 'SUBSTITUTE']],
  ['Date & Time', ['TODAY', 'NOW', 'DATE', 'EDATE', 'EOMONTH', 'YEAR', 'MONTH', 'DAY']],
  ['Lookup', ['XLOOKUP', 'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'FILTER']],
  ['Math & Trig', ['SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'ROUND', 'ABS', 'SQRT']],
]

const INSERT_SYMBOLS = ['©', '®', '™', '±', '×', '÷', '≤', '≥', '≈', 'Δ', 'Σ', '€', '£', '¥']

const createBlankModel = (rowCount = DEFAULT_ROWS, columnCount = DEFAULT_COLUMNS) => ({
  headers: Array(Math.max(columnCount - 1, 0)).fill(''),
  rows: Array.from({ length: rowCount }, () => ({ label: '', values: Array(Math.max(columnCount - 1, 0)).fill('') })),
  formats: {},
  comments: {},
  merges: [],
  colWidths: {},
  rowHeights: {},
  view: {
    fixedRowsTop: 0,
    fixedColumnsStart: 0,
    showHeaders: true,
    showGridlines: true,
    showFormulas: false,
    zoom: 100,
  },
})
const INITIAL_MODEL = createBlankModel()

const toGrid = (model) => model.rows.map((row) => [row.label, ...row.values])
const toModel = (data, columnCount) => ({
  headers: Array(Math.max(columnCount - 1, 0)).fill(''),
  rows: data.map((row) => ({
    label: String(row[0] ?? ''),
    values: Array.from({ length: Math.max(columnCount - 1, 0) }, (_, index) => row[index + 1] == null ? '' : String(row[index + 1])),
  })),
})

const boundsOf = ({ row, col, row2, col2 }) => ({
  top: Math.min(row, row2),
  bottom: Math.max(row, row2),
  left: Math.min(col, col2),
  right: Math.max(col, col2),
})

// Strip empty keys so a fully-cleared cell drops out of the sparse formats map.
const pruneFormat = (fmt) => {
  const out = {}
  for (const key of ['b', 'i', 'u', 's', 'w', 'a', 'va', 'c', 'bg', 'nf', 'ff', 'fs', 't', 'link']) if (fmt[key]) out[key] = fmt[key]
  if (fmt.bd && (fmt.bd.t || fmt.bd.r || fmt.bd.b || fmt.bd.l)) {
    out.bd = {}
    for (const edge of ['t', 'r', 'b', 'l']) if (fmt.bd[edge]) out.bd[edge] = true
  }
  return Object.keys(out).length ? out : null
}

// Shift a "row,col"-keyed map when rows/cols are inserted (delta > 0) or deleted
// (delta < 0, removing |delta| lines from `at`), keeping formatting attached to
// the right cells across structural edits.
const shiftKeyed = (map, axis, at, delta) => {
  if (!map) return {}
  const out = {}
  for (const key in map) {
    const [r, c] = key.split(',').map(Number)
    const idx = axis === 'row' ? r : c
    if (delta < 0 && idx >= at && idx < at - delta) continue // deleted line
    const shifted = idx >= at ? idx + delta : idx
    out[axis === 'row' ? cellKey(shifted, c) : cellKey(r, shifted)] = map[key]
  }
  return out
}

const shiftColWidths = (widths, at, delta) => {
  if (!widths) return {}
  const out = {}
  for (const key in widths) {
    const col = Number(key)
    if (delta < 0 && col >= at && col < at - delta) continue
    out[col >= at ? col + delta : col] = widths[key]
  }
  return out
}

// Shift merges across a structural edit. Merges intersecting a deleted range (or
// straddling an insertion) are dropped rather than half-adjusted.
const shiftMerges = (merges, axis, at, delta) => {
  if (!Array.isArray(merges)) return []
  const out = []
  for (const merge of merges) {
    const start = axis === 'row' ? merge.row : merge.col
    const span = axis === 'row' ? merge.rowspan : merge.colspan
    const end = start + span - 1
    if (delta > 0) {
      if (start >= at) out.push(axis === 'row' ? { ...merge, row: start + delta } : { ...merge, col: start + delta })
      else if (at > end) out.push({ ...merge })
      // else: insertion splits the merge → drop it
    } else {
      const removeEnd = at - delta - 1
      if (end < at) out.push({ ...merge }) // entirely before
      else if (start > removeEnd) out.push(axis === 'row' ? { ...merge, row: start + delta } : { ...merge, col: start + delta })
      // else: intersects the deleted range → drop it
    }
  }
  return out
}

const migrateModel = (model) => {
  if (!model?.rows) return INITIAL_MODEL
  const extras = {
    formats: model.formats || {},
    comments: model.comments || {},
    merges: Array.isArray(model.merges) ? model.merges : [],
    colWidths: model.colWidths || {},
    rowHeights: model.rowHeights || {},
    view: { ...createBlankModel(1, 1).view, ...(model.view || {}) },
  }
  const headers = Array.isArray(model.headers) ? model.headers : []
  if (!headers.some((header) => String(header).trim())) {
    return { ...toModel(toGrid(model), Math.max(headers.length + 1, 1)), ...extras }
  }
  // Legacy models kept header text in a separate row; fold it into a data row and
  // push the formatting down one row to stay aligned.
  return {
    ...toModel([['', ...headers], ...toGrid(model)], headers.length + 1),
    formats: shiftKeyed(extras.formats, 'row', 0, 1),
    comments: shiftKeyed(extras.comments, 'row', 0, 1),
    merges: shiftMerges(extras.merges, 'row', 0, 1),
    colWidths: extras.colWidths,
    rowHeights: shiftColWidths(extras.rowHeights, 0, 1),
  }
}

const workbookRows = (worksheet) => {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false })
  const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null
  if (range) {
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
        if (cell?.f) {
          rows[row] ||= []
          rows[row][col] = `=${cell.f}`
        }
      }
    }
  }
  return rows
}

const cssColorFromXlsx = (color) => {
  const rgb = color?.rgb
  if (!rgb) return undefined
  const hex = String(rgb).replace(/^FF/i, '')
  return /^[0-9A-F]{6}$/i.test(hex) ? `#${hex}` : undefined
}

const workbookFormats = (worksheet) => {
  if (!worksheet['!ref']) return {}
  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const formats = {}
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
      if (!cell) continue
      const style = cell.s || {}
      const fmt = {}
      if (style.font?.bold) fmt.b = true
      if (style.font?.italic) fmt.i = true
      if (style.font?.underline) fmt.u = true
      if (style.font?.strike) fmt.s = true
      if (style.font?.name) fmt.ff = style.font.name
      if (style.font?.sz) fmt.fs = Number(style.font.sz)
      const fontColor = cssColorFromXlsx(style.font?.color)
      if (fontColor) fmt.c = fontColor
      const fillColor = cssColorFromXlsx(style.fill?.fgColor || style.fgColor)
      if (fillColor) fmt.bg = fillColor
      if (style.alignment?.horizontal) fmt.a = style.alignment.horizontal
      if (style.alignment?.vertical) fmt.va = style.alignment.vertical === 'center' ? 'middle' : style.alignment.vertical
      if (style.alignment?.wrapText) fmt.w = true
      const border = style.border || {}
      if (border.top || border.right || border.bottom || border.left) {
        fmt.bd = {
          ...(border.top ? { t: true } : {}),
          ...(border.right ? { r: true } : {}),
          ...(border.bottom ? { b: true } : {}),
          ...(border.left ? { l: true } : {}),
        }
      }
      const numberFormat = excelZToNumbro(cell.z || style.numFmt)
      if (numberFormat) fmt.nf = numberFormat
      const safeLink = normalizePublicUrl(cell.l?.Target)
      if (safeLink) fmt.link = safeLink
      if (Object.keys(fmt).length) formats[cellKey(row, col)] = fmt
    }
  }
  return formats
}

const workbookComments = (worksheet) => {
  if (!worksheet['!ref']) return {}
  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const comments = {}
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
      const text = cell?.c?.map((comment) => comment.t).filter(Boolean).join('\n\n')
      if (text) comments[cellKey(row, col)] = text
    }
  }
  return comments
}

// Read core workbook layout back out of an imported worksheet so a round-trip
// keeps the dimensions, merges, number formats, and styles the file exposes.
const workbookLayout = (worksheet) => {
  const merges = (worksheet['!merges'] || []).map((m) => ({
    row: m.s.r, col: m.s.c, rowspan: m.e.r - m.s.r + 1, colspan: m.e.c - m.s.c + 1,
  }))
  const colWidths = {}
  ;(worksheet['!cols'] || []).forEach((col, index) => {
    if (col?.wpx) colWidths[index] = Math.round(col.wpx)
  })
  const rowHeights = {}
  ;(worksheet['!rows'] || []).forEach((row, index) => {
    if (row?.hpx) rowHeights[index] = Math.round(row.hpx)
    else if (row?.hpt) rowHeights[index] = Math.round(row.hpt * 96 / 72)
  })
  return { merges, colWidths, rowHeights, formats: workbookFormats(worksheet), comments: workbookComments(worksheet) }
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const makeSearchRegExp = (term, matchCase) => new RegExp(escapeRegExp(term), matchCase ? 'g' : 'gi')

const cycleAbsoluteReference = (value, caret) => {
  const before = value.slice(0, caret)
  const match = before.match(/(\$?)([A-Za-z]+)(\$?)(\d+)$/)
  if (!match) return null
  const [, columnAbsolute, column, rowAbsolute, row] = match
  let replacement
  if (!columnAbsolute && !rowAbsolute) replacement = `$${column.toUpperCase()}$${row}`
  else if (columnAbsolute && rowAbsolute) replacement = `${column.toUpperCase()}$${row}`
  else if (!columnAbsolute && rowAbsolute) replacement = `$${column.toUpperCase()}${row}`
  else replacement = `${column.toUpperCase()}${row}`
  const start = caret - match[0].length
  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(caret)}`
  return { value: nextValue, caret: start + replacement.length }
}

const SpreadsheetGrid = memo(function SpreadsheetGrid({
  data, columnCount, fixedRowsTop, fixedColumnsStart, formats, notes, merges, colWidths, rowHeights,
  contextMenu, showHeaders, showGridlines, showFormulas, formulaEngine, sheetName,
  hotRef, onSelection, onGridChange, onColWidth, onRowHeight, onRememberSelection, onGridReorder,
}) {
  const cellsFn = useMemo(() => buildCellsFn(formats, notes), [formats, notes])
  const colWidthsFn = useMemo(() => buildColWidthsFn(colWidths), [colWidths])
  const rowHeightsFn = useMemo(() => buildRowHeightsFn(rowHeights), [rowHeights])
  const formulasConfig = useMemo(() => ({ engine: formulaEngine, sheetName }), [formulaEngine, sheetName])
  const reportVisualOrder = (axis) => {
    const instance = hotRef.current?.hotInstance
    if (!instance) return
    const rowOrder = Array.from({ length: instance.countRows() }, (_, index) => instance.toPhysicalRow(index))
    const colOrder = Array.from({ length: instance.countCols() }, (_, index) => instance.toPhysicalColumn(index))
    onGridReorder(axis, rowOrder, colOrder)
  }
  return <HotTable
    ref={hotRef}
    data={data}
    colHeaders={showHeaders ? (index) => columnLabel(index) : false}
    rowHeaders={showHeaders}
    width="100%"
    height={520}
    colWidths={colWidthsFn}
    rowHeights={rowHeightsFn}
    rowHeaderWidth={46}
    stretchH="none"
    contextMenu={contextMenu}
    copyPaste
    comments
    fillHandle
    mergeCells={merges}
    manualColumnResize
    manualRowResize
    manualColumnMove
    manualRowMove
    dropdownMenu
    filters
    columnSorting
    autoWrapRow
    autoWrapCol
    fixedRowsTop={fixedRowsTop}
    fixedColumnsStart={fixedColumnsStart}
    minCols={columnCount}
    cells={cellsFn}
    formulas={formulasConfig}
    licenseKey="non-commercial-and-evaluation"
    className={`ht-theme-main spreadsheet-grid-theme ${showGridlines ? '' : 'no-gridlines'}`}
    afterSelectionEnd={onSelection}
    afterColumnResize={(newSize, column) => onColWidth(column, newSize)}
    afterRowResize={(newSize, row) => onRowHeight(row, newSize)}
    afterRenderer={(td, row, col, prop, value, cellProperties) => {
      applyCellStyle(td, cellProperties)
      if (showFormulas) {
        const instance = hotRef.current?.hotInstance
        const physicalRow = instance?.toPhysicalRow(row)
        const physicalCol = instance?.toPhysicalColumn(col)
        const source = physicalRow == null || physicalCol == null
          ? null
          : instance.getSourceDataAtCell(physicalRow, physicalCol)
        if (typeof source === 'string' && source.startsWith('=')) td.textContent = source
      }
    }}
    afterCopy={onRememberSelection}
    afterCut={onRememberSelection}
    afterOnCellMouseDown={(event, coords) => {
      if (event.detail !== 2 || coords.row < 0 || coords.col < 0) return
      const instance = hotRef.current?.hotInstance
      const row = instance?.toPhysicalRow(coords.row)
      const col = instance?.toPhysicalColumn(coords.col)
      const link = row == null || col == null ? null : normalizePublicUrl(formats?.[cellKey(row, col)]?.link)
      if (link) window.open(link, '_blank', 'noopener,noreferrer')
    }}
    afterRowMove={(movedRows, finalIndex, dropIndex, movePossible, orderChanged) => {
      if (movePossible && orderChanged) reportVisualOrder('row')
    }}
    afterColumnMove={(movedColumns, finalIndex, dropIndex, movePossible, orderChanged) => {
      if (movePossible && orderChanged) reportVisualOrder('col')
    }}
    afterChange={(changes, source) => {
      if (!changes || source === 'loadData') return
      const instance = hotRef.current?.hotInstance
      if (instance) onGridChange(instance.getSourceDataArray())
    }}
  />
})

function RibbonButton({ icon, label, title = label, active = false, danger = false, onClick }) {
  return <button type="button" className={`excel-ribbon-button ${active ? 'active' : ''} ${danger ? 'danger' : ''}`} title={title} onClick={onClick}>
    {icon ? <i className={`${icon} text-sm`}></i> : <span className="excel-ribbon-glyph">{label}</span>}
    {icon && <span>{label}</span>}
  </button>
}

function RibbonGroup({ label, children }) {
  return <div className="excel-ribbon-group"><div className="excel-ribbon-controls">{children}</div><span className="excel-ribbon-group-label">{label}</span></div>
}

// A ribbon button that opens a small dropdown menu, like Excel's split/menu
// buttons (Insert ▾, Sort & Filter ▾, Borders ▾ …). The popover renders in a
// portal so the ribbon's horizontal scroll doesn't clip it.
function RibbonMenu({ icon, label, title = label, items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) setOpen(false)
    }
    const onEscape = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const toggle = () => {
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 216)), top: rect.bottom + 2 })
    setOpen((value) => !value)
  }

  return <>
    <button ref={buttonRef} type="button" className={`excel-ribbon-button menu ${open ? 'active' : ''}`} title={title} onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
      {icon ? <i className={`${icon} text-sm`}></i> : <span className="excel-ribbon-glyph">{label}</span>}
      {icon && <span>{label}</span>}
      <i className="icon-chevron-down excel-ribbon-caret"></i>
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <div ref={menuRef} className="excel-ribbon-menu" style={{ left: pos.left, top: pos.top }} role="menu">
        {items.map((item, index) => item.sep
          ? <div key={`sep-${index}`} className="excel-ribbon-menu-sep" />
          : <button key={item.label} type="button" role="menuitem" className={`excel-ribbon-menu-item ${item.danger ? 'danger' : ''}`} onClick={() => { setOpen(false); item.onClick() }}>
            {item.icon && <i className={`${item.icon} text-xs`}></i>}<span>{item.label}</span>
          </button>)}
      </div>, document.body)}
  </>
}

export default function SpreadsheetEditor({ initialModel, onChange }) {
  const [sheets, setSheets] = useState(() => {
    if (initialModel?.sheets) return initialModel.sheets.map((sheet) => ({ ...sheet, model: migrateModel(sheet.model) }))
    return [{ name: 'Sheet1', model: migrateModel(initialModel || INITIAL_MODEL) }]
  })
  const [formulaEngine] = useState(() => createWorkbookFormulaEngine(sheets))
  const formulaEngineDestroyTimer = useRef(null)
  const [fileName, setFileName] = useState(initialModel?.filename || DEFAULT_FILE_NAME)
  const [activeSheet, setActiveSheet] = useState(() => {
    const firstVisible = sheets.findIndex((sheet) => !sheet.hidden)
    return firstVisible < 0 ? 0 : firstVisible
  })
  const [activeRibbon, setActiveRibbon] = useState('Home')
  const [selection, setSelection] = useState({ row: 0, col: 0, row2: 0, col2: 0 })
  const [addressDraft, setAddressDraft] = useState('A1')
  const [sheetMenu, setSheetMenu] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [findMode, setFindMode] = useState('find') // 'find' | 'replace'
  const [findTerm, setFindTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [allSheets, setAllSheets] = useState(false)
  const [findStatus, setFindStatus] = useState('')
  const [fxOpen, setFxOpen] = useState(false)
  const [fxQuery, setFxQuery] = useState('')
  const [formulaEditing, setFormulaEditing] = useState(false)
  const [formulaDraft, setFormulaDraft] = useState('')
  const [formatPainterActive, setFormatPainterActive] = useState(false)
  const hotRef = useRef(null)
  const fileInputRef = useRef(null)
  const sheetMenuRef = useRef(null)
  const renameInputRef = useRef(null)
  const formulaBarRef = useRef(null)
  const shellRef = useRef(null)
  const findInputRef = useRef(null)
  const internalClipboardRef = useRef(null)
  const formatPainterRef = useRef(null)
  // Current values mirrored into refs so the (stable) history callbacks always
  // read the latest state without being re-created.
  const sheetsRef = useRef(sheets)
  const fileNameRef = useRef(fileName)
  const activeSheetRef = useRef(activeSheet)
  const onChangeRef = useRef(onChange)
  const historyRef = useRef({ past: [], future: [] })
  sheetsRef.current = sheets
  fileNameRef.current = fileName
  activeSheetRef.current = activeSheet
  onChangeRef.current = onChange
  const model = sheets[activeSheet]?.model || INITIAL_MODEL
  const view = { ...INITIAL_MODEL.view, ...(model.view || {}) }
  const fixedRowsTop = Math.min(view.fixedRowsTop || 0, Math.max(model.rows.length - 1, 0))
  const fixedColumnsStart = Math.min(view.fixedColumnsStart || 0, Math.max((model.headers?.length || 0), 0))
  const showHeaders = view.showHeaders !== false
  const showGridlines = view.showGridlines !== false
  const showFormulas = Boolean(view.showFormulas)
  const zoom = Number(view.zoom) || 100
  // Keyed on rows so formatting-only edits keep the same data reference and the
  // grid re-styles in place instead of reloading (no scroll/selection reset).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gridData = useMemo(() => toGrid(model), [model.rows])
  const mergesProp = useMemo(() => mergesFor(model.merges), [model.merges])
  const columnCount = Math.max(model.headers.length + 1, 1)
  const range = boundsOf(selection)
  const selectedCellValue = gridData[selection.row]?.[selection.col] ?? ''
  const selectedValue = formulaEditing ? formulaDraft : selectedCellValue
  const selectedAddress = selection.row === selection.row2 && selection.col === selection.col2
    ? `${columnLabel(selection.col)}${selection.row + 1}`
    : `${columnLabel(range.left)}${range.top + 1}:${columnLabel(range.right)}${range.bottom + 1}`

  const selectedNumbers = useMemo(() => {
    const values = []
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        const value = Number(String(gridData[row]?.[col] ?? '').replace(/[$,%]/g, ''))
        if (Number.isFinite(value) && String(gridData[row]?.[col] ?? '').trim() !== '') values.push(value)
      }
    }
    return values
  }, [gridData, range.bottom, range.left, range.right, range.top])

  useEffect(() => {
    clearTimeout(formulaEngineDestroyTimer.current)
    return () => {
      // Handsontable unregisters its formula listeners during its own passive
      // cleanup. Defer engine destruction until that child cleanup has run;
      // the next setup cancels this timer during React Strict Mode's probe.
      formulaEngineDestroyTimer.current = setTimeout(() => formulaEngine.destroy(), 0)
    }
  }, [formulaEngine])

  const notifyChange = useCallback((nextSheets, nextFileName = fileName) => {
    onChange?.({ filename: nextFileName, sheets: nextSheets })
  }, [fileName, onChange])

  // ---- Undo / redo (model-level) -------------------------------------------
  // The grid is controlled — every edit rebuilds its data from the model, which
  // wipes Handsontable's own undo stack. So we keep history ourselves: a snapshot
  // of the whole workbook is pushed before each change, and undo/redo restore it.

  const recordHistory = useCallback(() => {
    const history = historyRef.current
    history.past.push({ sheets: sheetsRef.current, fileName: fileNameRef.current, activeSheet: activeSheetRef.current })
    if (history.past.length > 200) history.past.shift()
    history.future = []
  }, [])

  const restoreSnapshot = useCallback((snapshot) => {
    syncWorkbookFormulaEngine(formulaEngine, snapshot.sheets)
    setSheets(snapshot.sheets)
    setFileName(snapshot.fileName)
    setActiveSheet(Math.min(snapshot.activeSheet ?? 0, snapshot.sheets.length - 1))
    onChangeRef.current?.({ filename: snapshot.fileName, sheets: snapshot.sheets })
  }, [formulaEngine])

  const undoModel = useCallback(() => {
    const history = historyRef.current
    if (!history.past.length) return
    history.future.push({ sheets: sheetsRef.current, fileName: fileNameRef.current, activeSheet: activeSheetRef.current })
    restoreSnapshot(history.past.pop())
  }, [restoreSnapshot])

  const redoModel = useCallback(() => {
    const history = historyRef.current
    if (!history.future.length) return
    history.past.push({ sheets: sheetsRef.current, fileName: fileNameRef.current, activeSheet: activeSheetRef.current })
    restoreSnapshot(history.future.pop())
  }, [restoreSnapshot])

  const update = useCallback((next) => {
    recordHistory()
    const nextSheets = sheets.map((sheet, index) => index === activeSheet ? { ...sheet, model: next } : sheet)
    if (next.rows !== model.rows && formulaEngine.doesSheetExist(sheets[activeSheet].name)) {
      formulaEngine.setSheetContent(formulaEngine.getSheetId(sheets[activeSheet].name), gridFromSheetModel(next))
    }
    setSheets(nextSheets)
    notifyChange(nextSheets)
  }, [activeSheet, formulaEngine, model.rows, notifyChange, recordHistory, sheets])

  const updateView = (patch) => update({ ...model, view: { ...view, ...patch } })

  // Preserve formatting/layout when rebuilding a sheet from a 2D data array.
  const withFormatting = (next) => ({
    ...next,
    formats: model.formats || {},
    comments: model.comments || {},
    merges: model.merges || [],
    colWidths: model.colWidths || {},
    rowHeights: model.rowHeights || {},
    view: model.view || INITIAL_MODEL.view,
  })

  const commitFormulaBar = () => {
    if (!formulaEditing) return
    const data = toGrid(model)
    if (!data[selection.row]) return
    data[selection.row][selection.col] = formulaDraft
    update(withFormatting(toModel(data, columnCount)))
    setFormulaEditing(false)
  }

  const updateFileName = (name) => {
    recordHistory()
    setFileName(name)
    notifyChange(sheets, name)
  }

  const handleSelection = useCallback((row, col, row2, col2) => {
    if (row < 0 || col < 0) return
    const next = { row, col, row2, col2 }
    setSelection(next)
    const nextRange = boundsOf(next)
    setAddressDraft(row === row2 && col === col2
      ? `${columnLabel(col)}${row + 1}`
      : `${columnLabel(nextRange.left)}${nextRange.top + 1}:${columnLabel(nextRange.right)}${nextRange.bottom + 1}`)
  }, [])

  const handleGridChange = useCallback((data) => {
    update({ ...toModel(data, columnCount), formats: model.formats || {}, comments: model.comments || {}, merges: model.merges || [], colWidths: model.colWidths || {}, rowHeights: model.rowHeights || {}, view: model.view || INITIAL_MODEL.view })
  }, [columnCount, model.colWidths, model.comments, model.formats, model.merges, model.rowHeights, model.view, update])

  const handleColWidth = useCallback((column, size) => {
    update({ ...model, colWidths: { ...(model.colWidths || {}), [column]: size } })
  }, [model, update])

  const handleRowHeight = useCallback((row, size) => {
    update({ ...model, rowHeights: { ...(model.rowHeights || {}), [row]: size } })
  }, [model, update])

  const handleGridReorder = (_axis, rowOrder, colOrder) => {
    const reorderedSheets = serializeWorkbookFormulaEngine(formulaEngine, sheets)
    const sheet = reorderedSheets[activeSheet]
    if (!sheet) return
    const oldModel = model
    const rowInverse = new Map(rowOrder.map((oldIndex, newIndex) => [oldIndex, newIndex]))
    const colInverse = new Map(colOrder.map((oldIndex, newIndex) => [oldIndex, newIndex]))
    const formats = {}
    for (const [key, fmt] of Object.entries(oldModel.formats || {})) {
      const [oldRow, oldCol] = key.split(',').map(Number)
      const newRow = rowInverse.get(oldRow)
      const newCol = colInverse.get(oldCol)
      if (newRow != null && newCol != null) formats[cellKey(newRow, newCol)] = fmt
    }
    const comments = {}
    for (const [key, note] of Object.entries(oldModel.comments || {})) {
      const [oldRow, oldCol] = key.split(',').map(Number)
      const newRow = rowInverse.get(oldRow)
      const newCol = colInverse.get(oldCol)
      if (newRow != null && newCol != null) comments[cellKey(newRow, newCol)] = note
    }
    const rowHeights = {}
    rowOrder.forEach((oldRow, newRow) => {
      if (oldModel.rowHeights?.[oldRow] != null) rowHeights[newRow] = oldModel.rowHeights[oldRow]
    })
    const colWidths = {}
    colOrder.forEach((oldCol, newCol) => {
      if (oldModel.colWidths?.[oldCol] != null) colWidths[newCol] = oldModel.colWidths[oldCol]
    })
    const merges = (oldModel.merges || []).flatMap((merge) => {
      const rows = Array.from({ length: merge.rowspan }, (_, offset) => rowInverse.get(merge.row + offset)).sort((a, b) => a - b)
      const cols = Array.from({ length: merge.colspan }, (_, offset) => colInverse.get(merge.col + offset)).sort((a, b) => a - b)
      if (rows.some((value) => value == null) || cols.some((value) => value == null)) return []
      const rowsContiguous = rows.every((value, index) => index === 0 || value === rows[index - 1] + 1)
      const colsContiguous = cols.every((value, index) => index === 0 || value === cols[index - 1] + 1)
      return rowsContiguous && colsContiguous
        ? [{ row: rows[0], col: cols[0], rowspan: rows.length, colspan: cols.length }]
        : []
    })
    const nextSheets = reorderedSheets.map((item, index) => index === activeSheet
      ? { ...item, model: { ...item.model, formats, comments, rowHeights, colWidths, merges } }
      : item)
    recordHistory()
    setSheets(nextSheets)
    notifyChange(nextSheets)
  }

  const jumpToAddress = (event) => {
    event.preventDefault()
    const match = addressDraft.trim().match(/^([A-Za-z]+)(\d+)$/)
    if (!match) return setAddressDraft(selectedAddress)
    const col = columnIndexFromLabel(match[1])
    const row = Number(match[2]) - 1
    if (row < 0 || row >= gridData.length || col < 0 || col >= columnCount) return setAddressDraft(selectedAddress)
    hotRef.current?.hotInstance?.selectCell(row, col)
  }

  // ---- Formatting (persisted into model.formats) ----------------------------

  const everySelected = (predicate) => {
    const formats = model.formats || {}
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        if (!predicate(formats[cellKey(row, col)])) return false
      }
    }
    return true
  }

  const applyFormat = (mutate) => {
    const formats = { ...(model.formats || {}) }
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        const key = cellKey(row, col)
        const cleaned = pruneFormat(mutate({ ...(formats[key] || {}) }))
        if (cleaned) formats[key] = cleaned
        else delete formats[key]
      }
    }
    update({ ...model, formats })
  }

  const toggleBool = (key) => {
    const allSet = everySelected((fmt) => fmt?.[key])
    applyFormat((fmt) => { if (allSet) delete fmt[key]; else fmt[key] = true; return fmt })
  }

  const setAlign = (align) => {
    const allSet = everySelected((fmt) => fmt?.a === align)
    applyFormat((fmt) => { if (allSet) delete fmt.a; else fmt.a = align; return fmt })
  }

  const setColor = (key, value) => applyFormat((fmt) => { fmt[key] = value; return fmt })

  const setNumberFormat = (id) => {
    const pattern = NUMBER_FORMATS[id]
    applyFormat((fmt) => { if (pattern == null) delete fmt.nf; else fmt.nf = pattern; return fmt })
  }

  const changeDecimals = (delta) => applyFormat((fmt) => { fmt.nf = adjustDecimals(fmt.nf || '0', delta); return fmt })

  const setFontFamily = (family) => applyFormat((fmt) => { if (family) fmt.ff = family; else delete fmt.ff; return fmt })

  const setFontSize = (size) => applyFormat((fmt) => { fmt.fs = Number(size) || DEFAULT_FONT_SIZE; return fmt })

  const changeFontSize = (delta) => applyFormat((fmt) => {
    fmt.fs = Math.max(6, Math.min(72, (Number(fmt.fs) || DEFAULT_FONT_SIZE) + delta))
    return fmt
  })

  const setVAlign = (align) => {
    const allSet = everySelected((fmt) => fmt?.va === align)
    applyFormat((fmt) => { if (allSet) delete fmt.va; else fmt.va = align; return fmt })
  }

  // The font-family/size selects reflect the active cell's format.
  const activeFormat = (model.formats || {})[cellKey(selection.row, selection.col)] || {}

  const setBorders = (kind) => applyFormat((fmt) => {
    if (kind === 'none') { delete fmt.bd; return fmt }
    if (kind === 'all') { fmt.bd = { t: true, r: true, b: true, l: true }; return fmt }
    return fmt // outline/edges handled below (needs cell position)
  })

  // Edge borders depend on a cell's position within the selection, so they can't
  // go through the position-agnostic applyFormat.
  const setEdgeBorders = (kind) => {
    const formats = { ...(model.formats || {}) }
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        const key = cellKey(row, col)
        const fmt = { ...(formats[key] || {}) }
        const bd = { ...(fmt.bd || {}) }
        if ((kind === 'outline' || kind === 'top') && row === range.top) bd.t = true
        if ((kind === 'outline' || kind === 'bottom') && row === range.bottom) bd.b = true
        if ((kind === 'outline' || kind === 'left') && col === range.left) bd.l = true
        if ((kind === 'outline' || kind === 'right') && col === range.right) bd.r = true
        fmt.bd = bd
        const cleaned = pruneFormat(fmt)
        if (cleaned) formats[key] = cleaned
        else delete formats[key]
      }
    }
    update({ ...model, formats })
  }

  const applyBorders = (kind) => {
    if (kind === 'none' || kind === 'all') setBorders(kind)
    else setEdgeBorders(kind)
  }

  const clearFormatting = () => applyFormat(() => ({}))

  const startFormatPainter = () => {
    const copied = []
    for (let row = range.top; row <= range.bottom; row += 1) {
      const formatRow = []
      for (let col = range.left; col <= range.right; col += 1) {
        const fmt = model.formats?.[cellKey(row, col)]
        formatRow.push(fmt ? structuredClone(fmt) : null)
      }
      copied.push(formatRow)
    }
    formatPainterRef.current = copied
    setFormatPainterActive(true)
  }

  useEffect(() => {
    const copied = formatPainterRef.current
    if (!copied) return
    const formats = { ...(model.formats || {}) }
    const height = copied.length
    const width = copied[0]?.length || 1
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        const fmt = copied[(row - range.top) % height]?.[(col - range.left) % width]
        const key = cellKey(row, col)
        if (fmt) formats[key] = structuredClone(fmt)
        else delete formats[key]
      }
    }
    formatPainterRef.current = null
    setFormatPainterActive(false)
    update({ ...model, formats })
    // Only a new grid selection should consume the painter; activating the tool
    // itself intentionally does not re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.row, selection.col, selection.row2, selection.col2])

  // ---- Structure ------------------------------------------------------------

  const addRow = () => {
    const insertAt = Math.min(range.bottom + 1, model.rows.length)
    const rows = [...model.rows]
    rows.splice(insertAt, 0, { label: '', values: Array(columnCount - 1).fill('') })
    update({
      ...model,
      rows,
      formats: shiftKeyed(model.formats, 'row', insertAt, 1),
      comments: shiftKeyed(model.comments, 'row', insertAt, 1),
      merges: shiftMerges(model.merges, 'row', insertAt, 1),
      rowHeights: shiftColWidths(model.rowHeights, insertAt, 1),
    })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(insertAt, range.left))
  }

  const deleteRows = () => {
    const count = range.bottom - range.top + 1
    const rows = model.rows.filter((_, index) => index < range.top || index > range.bottom)
    const nextRows = rows.length ? rows : createBlankModel(1, columnCount).rows
    update({
      ...model,
      rows: nextRows,
      formats: rows.length ? shiftKeyed(model.formats, 'row', range.top, -count) : {},
      comments: rows.length ? shiftKeyed(model.comments, 'row', range.top, -count) : {},
      merges: rows.length ? shiftMerges(model.merges, 'row', range.top, -count) : [],
      rowHeights: rows.length ? shiftColWidths(model.rowHeights, range.top, -count) : {},
    })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(Math.min(range.top, nextRows.length - 1), Math.min(range.left, columnCount - 1)))
  }

  const addColumn = () => {
    const insertAt = Math.min(range.right + 1, columnCount)
    const data = toGrid(model).map((row) => {
      const next = [...row]
      next.splice(insertAt, 0, '')
      return next
    })
    update({
      ...toModel(data, columnCount + 1),
      formats: shiftKeyed(model.formats, 'col', insertAt, 1),
      comments: shiftKeyed(model.comments, 'col', insertAt, 1),
      merges: shiftMerges(model.merges, 'col', insertAt, 1),
      colWidths: shiftColWidths(model.colWidths, insertAt, 1),
      rowHeights: model.rowHeights || {},
      view: model.view || INITIAL_MODEL.view,
    })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(range.top, insertAt))
  }

  const deleteColumns = () => {
    const deleteCount = range.right - range.left + 1
    if (columnCount - deleteCount < 1) return
    const data = toGrid(model).map((row) => row.filter((_, index) => index < range.left || index > range.right))
    const nextColumnCount = columnCount - deleteCount
    update({
      ...toModel(data, nextColumnCount),
      formats: shiftKeyed(model.formats, 'col', range.left, -deleteCount),
      comments: shiftKeyed(model.comments, 'col', range.left, -deleteCount),
      merges: shiftMerges(model.merges, 'col', range.left, -deleteCount),
      colWidths: shiftColWidths(model.colWidths, range.left, -deleteCount),
      rowHeights: model.rowHeights || {},
      view: model.view || INITIAL_MODEL.view,
    })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(range.top, Math.min(range.left, nextColumnCount - 1)))
  }

  const clearCells = () => {
    const data = toGrid(model)
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) data[row][col] = ''
    }
    update(withFormatting(toModel(data, columnCount)))
  }

  const mergeSelection = () => {
    if (range.top === range.bottom && range.left === range.right) return
    const merges = mergesFor(model.merges)
    const rowspan = range.bottom - range.top + 1
    const colspan = range.right - range.left + 1
    const existing = merges.findIndex((m) => m.row === range.top && m.col === range.left && m.rowspan === rowspan && m.colspan === colspan)
    let next
    if (existing >= 0) {
      next = merges.filter((_, index) => index !== existing) // toggle off
    } else {
      const overlaps = (m) => !(m.col + m.colspan - 1 < range.left || m.col > range.right || m.row + m.rowspan - 1 < range.top || m.row > range.bottom)
      next = [...merges.filter((m) => !overlaps(m)), { row: range.top, col: range.left, rowspan, colspan }]
    }
    update({ ...model, merges: next })
  }

  const sortSelection = (sortOrder) => {
    hotRef.current?.hotInstance?.getPlugin('columnSorting')?.sort({ column: selection.col, sortOrder })
  }

  const clearFilters = () => {
    const filters = hotRef.current?.hotInstance?.getPlugin('filters')
    filters?.clearConditions()
    filters?.filter()
  }

  // ---- Insert / data / review tools ---------------------------------------

  const insertCheckboxes = () => {
    const data = toGrid(model)
    const formats = { ...(model.formats || {}) }
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        const current = data[row]?.[col]
        data[row][col] = current === true || String(current).toLowerCase() === 'true'
        const key = cellKey(row, col)
        formats[key] = { ...(formats[key] || {}), t: 'checkbox', a: 'center' }
      }
    }
    update({ ...withFormatting(toModel(data, columnCount)), formats })
  }

  const insertTimestamp = (kind) => {
    const now = new Date()
    const pad = (value) => String(value).padStart(2, '0')
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const value = kind === 'time' ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : kind === 'datetime' ? `${date} ${pad(now.getHours())}:${pad(now.getMinutes())}` : date
    const data = toGrid(model)
    data[selection.row][selection.col] = value
    update(withFormatting(toModel(data, columnCount)))
  }

  const insertSymbol = (symbol) => {
    const data = toGrid(model)
    data[selection.row][selection.col] = `${data[selection.row][selection.col] ?? ''}${symbol}`
    update(withFormatting(toModel(data, columnCount)))
  }

  const insertHyperlink = () => {
    const entered = window.prompt('Link address:', 'https://')
    if (!entered?.trim()) return
    const address = entered.trim()
    const target = normalizePublicUrl(address, { assumeHttps: true })
    if (!target) {
      window.alert('Enter a valid web, email, telephone, or same-document link.')
      return
    }
    const current = String(gridData[selection.row]?.[selection.col] ?? '').trim()
    const label = window.prompt('Text to display:', current || address)
    if (label == null) return
    const data = toGrid(model)
    data[selection.row][selection.col] = label || address
    const key = cellKey(selection.row, selection.col)
    const formats = { ...(model.formats || {}), [key]: { ...(model.formats?.[key] || {}), link: target } }
    update({ ...withFormatting(toModel(data, columnCount)), formats })
  }

  const formatSelectionAsTable = (style) => {
    const palette = {
      green: { header: '#217346', stripe: '#e9f3ed', text: '#ffffff' },
      blue: { header: '#4472c4', stripe: '#d9e5f6', text: '#ffffff' },
      gray: { header: '#595959', stripe: '#eeeeee', text: '#ffffff' },
    }[style]
    const formats = { ...(model.formats || {}) }
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        const key = cellKey(row, col)
        const header = row === range.top
        formats[key] = {
          ...(formats[key] || {}),
          ...(header ? { b: true, bg: palette.header, c: palette.text } : (row - range.top) % 2 === 0 ? { bg: palette.stripe } : { bg: '#ffffff' }),
          bd: { t: true, r: true, b: true, l: true },
        }
      }
    }
    update({ ...model, formats })
  }

  const textToColumns = () => {
    const entered = window.prompt('Delimiter (comma, semicolon, tab, space, or a character):', 'comma')
    if (entered == null) return
    const named = { comma: ',', semicolon: ';', tab: '\t', space: ' ' }
    const delimiter = named[entered.trim().toLowerCase()] ?? entered
    if (!delimiter) return
    const pieces = []
    let widest = 1
    for (let row = range.top; row <= range.bottom; row += 1) {
      const parts = String(gridData[row]?.[range.left] ?? '').split(delimiter).map((part) => part.trim())
      pieces.push(parts)
      widest = Math.max(widest, parts.length)
    }
    const nextColumnCount = Math.max(columnCount, range.left + widest)
    const data = toGrid(model).map((row) => [...row, ...Array(Math.max(0, nextColumnCount - row.length)).fill('')])
    pieces.forEach((parts, rowOffset) => parts.forEach((part, colOffset) => {
      data[range.top + rowOffset][range.left + colOffset] = part
    }))
    update(withFormatting(toModel(data, nextColumnCount)))
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(range.top, range.left, range.bottom, range.left + widest - 1))
  }

  const removeDuplicates = (hasHeader) => {
    const start = Math.min(range.bottom + 1, range.top + (hasHeader ? 1 : 0))
    const seen = new Set()
    const removed = new Set()
    for (let row = start; row <= range.bottom; row += 1) {
      const key = JSON.stringify(gridData[row].slice(range.left, range.right + 1))
      if (seen.has(key)) removed.add(row)
      else seen.add(key)
    }
    if (!removed.size) {
      window.alert('No duplicate rows were found in the selection.')
      return
    }
    const rowMap = new Map()
    const data = []
    gridData.forEach((row, oldRow) => {
      if (removed.has(oldRow)) return
      rowMap.set(oldRow, data.length)
      data.push([...row])
    })
    const remapRows = (map) => Object.fromEntries(Object.entries(map || {}).flatMap(([key, value]) => {
      const [oldRow, col] = key.split(',').map(Number)
      const row = rowMap.get(oldRow)
      return row == null ? [] : [[cellKey(row, col), value]]
    }))
    const rowHeights = Object.fromEntries(Object.entries(model.rowHeights || {}).flatMap(([oldRow, value]) => {
      const row = rowMap.get(Number(oldRow))
      return row == null ? [] : [[row, value]]
    }))
    const merges = (model.merges || []).flatMap((merge) => {
      const rows = Array.from({ length: merge.rowspan }, (_, offset) => rowMap.get(merge.row + offset))
      if (rows.some((row) => row == null) || rows.some((row, index) => index > 0 && row !== rows[index - 1] + 1)) return []
      return [{ ...merge, row: rows[0] }]
    })
    update({
      ...toModel(data, columnCount),
      formats: remapRows(model.formats),
      comments: remapRows(model.comments),
      merges,
      colWidths: model.colWidths || {},
      rowHeights,
      view: model.view || INITIAL_MODEL.view,
    })
  }

  const trimWhitespace = () => {
    const data = toGrid(model)
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        if (typeof data[row][col] === 'string' && !data[row][col].startsWith('=')) data[row][col] = data[row][col].trim().replace(/\s+/g, ' ')
      }
    }
    update(withFormatting(toModel(data, columnCount)))
  }

  const calculateNow = () => {
    formulaEngine.rebuildAndRecalculate()
    hotRef.current?.hotInstance?.render()
  }

  const editNote = () => {
    const key = cellKey(selection.row, selection.col)
    const next = window.prompt('Cell note:', model.comments?.[key] || '')
    if (next == null) return
    const comments = { ...(model.comments || {}) }
    if (next.trim()) comments[key] = next.trim()
    else delete comments[key]
    update({ ...model, comments })
  }

  const deleteNote = () => {
    const key = cellKey(selection.row, selection.col)
    if (!model.comments?.[key]) return
    const comments = { ...(model.comments || {}) }
    delete comments[key]
    update({ ...model, comments })
  }

  const toggleFullScreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await shellRef.current?.requestFullscreen()
    } catch {
      window.alert('Full-screen mode is not available in this browser.')
    }
  }

  const addRowAbove = () => {
    const insertAt = range.top
    const rows = [...model.rows]
    rows.splice(insertAt, 0, { label: '', values: Array(columnCount - 1).fill('') })
    update({
      ...model,
      rows,
      formats: shiftKeyed(model.formats, 'row', insertAt, 1),
      comments: shiftKeyed(model.comments, 'row', insertAt, 1),
      merges: shiftMerges(model.merges, 'row', insertAt, 1),
      rowHeights: shiftColWidths(model.rowHeights, insertAt, 1),
    })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(insertAt, range.left))
  }

  const addColumnLeft = () => {
    const insertAt = range.left
    const data = toGrid(model).map((row) => {
      const next = [...row]
      next.splice(insertAt, 0, '')
      return next
    })
    update({
      ...toModel(data, columnCount + 1),
      formats: shiftKeyed(model.formats, 'col', insertAt, 1),
      comments: shiftKeyed(model.comments, 'col', insertAt, 1),
      merges: shiftMerges(model.merges, 'col', insertAt, 1),
      colWidths: shiftColWidths(model.colWidths, insertAt, 1),
      rowHeights: model.rowHeights || {},
      view: model.view || INITIAL_MODEL.view,
    })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(range.top, insertAt))
  }

  // ---- Clipboard ------------------------------------------------------------

  const rememberSelection = () => {
    const instance = hotRef.current?.hotInstance
    const source = toGrid(model)
    const raw = []
    const values = []
    const formats = []
    for (let row = range.top; row <= range.bottom; row += 1) {
      const rawRow = []
      const valueRow = []
      const formatRow = []
      for (let col = range.left; col <= range.right; col += 1) {
        rawRow.push(source[row]?.[col] ?? '')
        valueRow.push(instance?.getDataAtCell(row, col) ?? source[row]?.[col] ?? '')
        formatRow.push(model.formats?.[cellKey(row, col)] || null)
      }
      raw.push(rawRow)
      values.push(valueRow)
      formats.push(formatRow)
    }
    internalClipboardRef.current = {
      raw,
      values,
      formats,
      source: { sheet: sheets[activeSheet].name, ...range },
    }
    const sheetId = formulaEngine.getSheetId(sheets[activeSheet].name)
    formulaEngine.copy({
      start: { sheet: sheetId, row: range.top, col: range.left },
      end: { sheet: sheetId, row: range.bottom, col: range.right },
    })
  }

  const copySelection = () => {
    rememberSelection()
    hotRef.current?.hotInstance?.getPlugin('copyPaste')?.copy()
  }
  const cutSelection = () => {
    rememberSelection()
    hotRef.current?.hotInstance?.getPlugin('copyPaste')?.cut()
  }
  const pasteSelection = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const plugin = hotRef.current?.hotInstance?.getPlugin('copyPaste')
      if (text && typeof plugin?.paste === 'function') plugin.paste(text)
    } catch {
      /* clipboard blocked — Ctrl+V still works */
    }
  }

  const pasteSpecial = (kind) => {
    const clipboard = internalClipboardRef.current
    if (!clipboard) return
    if ((kind === 'all' || kind === 'formulas') && !formulaEngine.doesSheetExist(clipboard.source.sheet)) return
    recordHistory()

    if (kind === 'all' || kind === 'formulas') {
      const sourceSheetId = formulaEngine.getSheetId(clipboard.source.sheet)
      formulaEngine.copy({
        start: { sheet: sourceSheetId, row: clipboard.source.top, col: clipboard.source.left },
        end: { sheet: sourceSheetId, row: clipboard.source.bottom, col: clipboard.source.right },
      })
      formulaEngine.paste({
        sheet: formulaEngine.getSheetId(sheets[activeSheet].name),
        row: range.top,
        col: range.left,
      })
      let nextSheets = serializeWorkbookFormulaEngine(formulaEngine, sheets)
      if (kind === 'all') {
        nextSheets = nextSheets.map((sheet, index) => {
          if (index !== activeSheet) return sheet
          const formats = { ...(sheet.model.formats || {}) }
          clipboard.formats.forEach((formatRow, rowOffset) => formatRow.forEach((fmt, colOffset) => {
            const key = cellKey(range.top + rowOffset, range.left + colOffset)
            if (fmt) formats[key] = { ...fmt, ...(fmt.bd ? { bd: { ...fmt.bd } } : {}) }
            else delete formats[key]
          }))
          return { ...sheet, model: { ...sheet.model, formats } }
        })
      }
      setSheets(nextSheets)
      notifyChange(nextSheets)
      return
    }

    const transpose = kind === 'transpose'
    const sourceValues = clipboard.values
    const height = transpose ? sourceValues[0]?.length || 0 : sourceValues.length
    const width = transpose ? sourceValues.length : sourceValues[0]?.length || 0
    const nextRowCount = Math.max(model.rows.length, range.top + height)
    const nextColumnCount = Math.max(columnCount, range.left + width)
    const data = Array.from({ length: nextRowCount }, (_, row) =>
      Array.from({ length: nextColumnCount }, (_, col) => toGrid(model)[row]?.[col] ?? ''),
    )
    const formats = { ...(model.formats || {}) }

    for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
      for (let colOffset = 0; colOffset < width; colOffset += 1) {
        const sourceRow = transpose ? colOffset : rowOffset
        const sourceCol = transpose ? rowOffset : colOffset
        if (kind === 'values' || kind === 'transpose') {
          data[range.top + rowOffset][range.left + colOffset] = String(sourceValues[sourceRow]?.[sourceCol] ?? '')
        }
        if (kind === 'formats') {
          const key = cellKey(range.top + rowOffset, range.left + colOffset)
          const fmt = clipboard.formats[sourceRow]?.[sourceCol]
          if (fmt) formats[key] = { ...fmt, ...(fmt.bd ? { bd: { ...fmt.bd } } : {}) }
          else delete formats[key]
        }
      }
    }

    const nextModel = {
      ...toModel(data, nextColumnCount),
      formats,
      comments: model.comments || {},
      merges: model.merges || [],
      colWidths: model.colWidths || {},
      rowHeights: model.rowHeights || {},
      view: model.view || INITIAL_MODEL.view,
    }
    const nextSheets = sheets.map((sheet, index) => index === activeSheet ? { ...sheet, model: nextModel } : sheet)
    syncWorkbookFormulaEngine(formulaEngine, nextSheets)
    setSheets(nextSheets)
    notifyChange(nextSheets)
  }

  // ---- Formulas -------------------------------------------------------------

  // Excel's AutoSum family: place one aggregate below each selected column.
  const insertAggregate = (functionName) => {
    const targetRow = range.bottom + 1
    const data = toGrid(model)
    while (data.length <= targetRow) data.push(Array(columnCount).fill(''))
    for (let col = range.left; col <= range.right; col += 1) {
      const column = columnLabel(col)
      data[targetRow][col] = `=${functionName}(${column}${range.top + 1}:${column}${range.bottom + 1})`
    }
    update(withFormatting(toModel(data, columnCount)))
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(targetRow, range.left, targetRow, range.right))
  }

  const autoSum = () => insertAggregate('SUM')

  // ---- Row height / column width -------------------------------------------

  const promptColumnWidth = () => {
    const current = model.colWidths?.[selection.col] ?? DEFAULT_COL_WIDTH
    const value = Number(window.prompt('Column width (pixels):', String(current)))
    if (!Number.isFinite(value) || value <= 0) return
    const colWidths = { ...(model.colWidths || {}) }
    for (let col = range.left; col <= range.right; col += 1) colWidths[col] = value
    update({ ...model, colWidths })
  }

  const promptRowHeight = () => {
    const current = model.rowHeights?.[selection.row] ?? DEFAULT_ROW_HEIGHT
    const value = Number(window.prompt('Row height (pixels):', String(current)))
    if (!Number.isFinite(value) || value <= 0) return
    const rowHeights = { ...(model.rowHeights || {}) }
    for (let row = range.top; row <= range.bottom; row += 1) rowHeights[row] = value
    update({ ...model, rowHeights })
  }

  const fitColumns = () => hotRef.current?.hotInstance?.getPlugin('autoColumnSize')?.recalculateAllColumnsWidth()

  const openFind = (mode) => {
    setFindMode(mode)
    setFindOpen(true)
    setFindStatus('')
    requestAnimationFrame(() => { findInputRef.current?.focus(); findInputRef.current?.select() })
  }

  // ---- Find & replace -------------------------------------------------------

  const cellMatches = (value, term) => {
    if (!term) return false
    const haystack = matchCase ? String(value) : String(value).toLowerCase()
    return haystack.includes(matchCase ? term : term.toLowerCase())
  }

  const findNext = () => {
    if (!findTerm) return
    const total = gridData.length * columnCount
    if (!total) return
    const start = selection.row * columnCount + selection.col + 1
    for (let step = 0; step < total; step += 1) {
      const index = (start + step) % total
      const row = Math.floor(index / columnCount)
      const col = index % columnCount
      if (cellMatches(gridData[row]?.[col] ?? '', findTerm)) {
        hotRef.current?.hotInstance?.selectCell(row, col)
        setFindStatus('')
        return
      }
    }
    setFindStatus('No matches')
  }

  const replaceCurrent = () => {
    if (!findTerm) return
    const { row, col } = selection
    const current = String(gridData[row]?.[col] ?? '')
    if (cellMatches(current, findTerm)) {
      const data = toGrid(model)
      data[row][col] = current.replace(makeSearchRegExp(findTerm, matchCase), replaceTerm)
      update(withFormatting(toModel(data, columnCount)))
      requestAnimationFrame(findNext)
    } else {
      findNext()
    }
  }

  const replaceAll = () => {
    if (!findTerm) return
    const regExp = () => makeSearchRegExp(findTerm, matchCase)
    let count = 0
    const replaceInModel = (sheetModel) => {
      const data = toGrid(sheetModel)
      data.forEach((row, r) => row.forEach((value, c) => {
        if (cellMatches(value, findTerm)) {
          count += (String(value).match(regExp()) || []).length
          data[r][c] = String(value).replace(regExp(), replaceTerm)
        }
      }))
      return { ...toModel(data, Math.max(sheetModel.headers.length + 1, 1)), formats: sheetModel.formats || {}, comments: sheetModel.comments || {}, merges: sheetModel.merges || [], colWidths: sheetModel.colWidths || {}, rowHeights: sheetModel.rowHeights || {}, view: sheetModel.view || INITIAL_MODEL.view }
    }
    if (allSheets) {
      recordHistory()
      const nextSheets = sheets.map((sheet) => ({ ...sheet, model: replaceInModel(sheet.model) }))
      syncWorkbookFormulaEngine(formulaEngine, nextSheets)
      setSheets(nextSheets)
      notifyChange(nextSheets)
    } else {
      update(replaceInModel(model))
    }
    setFindStatus(count ? `Replaced ${count}` : 'No matches')
  }

  // ---- Insert function ------------------------------------------------------

  const insertFunction = (name) => {
    const formula = `=${name}()`
    setFormulaDraft(formula)
    setFormulaEditing(true)
    setFxOpen(false)
    requestAnimationFrame(() => {
      const input = formulaBarRef.current
      if (input) {
        input.focus()
        const caret = formula.length - 1
        input.setSelectionRange(caret, caret)
      }
    })
  }

  const fxResults = useMemo(() => {
    const query = fxQuery.trim().toLowerCase()
    if (!query) return FUNCTION_LIBRARY
    return FUNCTION_LIBRARY
      .map((group) => ({ ...group, items: group.items.filter((item) => item.name.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query)) }))
      .filter((group) => group.items.length)
  }, [fxQuery])

  const formulaAutocomplete = useMemo(() => {
    if (!formulaEditing || !String(selectedValue).startsWith('=')) return null
    const match = String(selectedValue).match(/([A-Za-z][A-Za-z0-9.]*)$/)
    if (!match) return null
    const query = match[1].toUpperCase()
    const names = FUNCTION_NAMES
      .filter((name) => name.startsWith(query))
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .slice(0, 8)
    if (!names.length || (names.length === 1 && names[0] === query)) return null
    return { query: match[1], items: names.map((name) => FUNCTION_INDEX.get(name)) }
  }, [formulaEditing, selectedValue])

  const acceptFormulaSuggestion = (name) => {
    if (!formulaAutocomplete) return
    const current = String(selectedValue)
    const next = `${current.slice(0, -formulaAutocomplete.query.length)}${name}(`
    setFormulaDraft(next)
    requestAnimationFrame(() => {
      formulaBarRef.current?.focus()
      formulaBarRef.current?.setSelectionRange(next.length, next.length)
    })
  }

  // ---- Import / export ------------------------------------------------------

  const importWorkbook = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true, cellStyles: true, cellNF: true })
      const nextSheets = workbook.SheetNames.map((name, sheetIndex) => {
        const worksheet = workbook.Sheets[name]
        const rows = workbookRows(worksheet)
        const importedColumnCount = Math.max(DEFAULT_COLUMNS, ...rows.map((row) => row.length), 1)
        const paddedRows = rows.length ? rows : createBlankModel(DEFAULT_ROWS, importedColumnCount).rows.map((row) => [row.label, ...row.values])
        return {
          name,
          hidden: Boolean(workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden),
          model: { ...toModel(paddedRows, importedColumnCount), view: { ...INITIAL_MODEL.view }, ...workbookLayout(worksheet) },
        }
      })
      if (nextSheets.length && nextSheets.every((sheet) => sheet.hidden)) nextSheets[0].hidden = false
      recordHistory()
      syncWorkbookFormulaEngine(formulaEngine, nextSheets)
      setSheets(nextSheets)
      setActiveSheet(0)
      setFileName(file.name)
      notifyChange(nextSheets, file.name)
    } catch {
      window.alert('This file could not be read as an Excel workbook.')
    }
    event.target.value = ''
  }

  const exportWorkbook = () => exportModelToXlsx(sheets, fileName, DEFAULT_FILE_NAME)

  // ---- Worksheets -----------------------------------------------------------

  const addSheet = () => {
    let number = sheets.length + 1
    while (sheets.some((sheet) => sheet.name === `Sheet${number}`)) number += 1
    const name = `Sheet${number}`
    const blankModel = createBlankModel(DEFAULT_ROWS, columnCount)
    formulaEngine.addSheet(name)
    formulaEngine.setSheetContent(formulaEngine.getSheetId(name), gridFromSheetModel(blankModel))
    const nextSheets = [...sheets, { name, model: blankModel }]
    recordHistory()
    setSheets(nextSheets)
    setActiveSheet(nextSheets.length - 1)
    notifyChange(nextSheets)
  }

  const sheetMenuPosition = (element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 212)),
      bottom: Math.max(8, window.innerHeight - rect.top + 4),
    }
  }

  const openSheetMenu = (event, sheetIndex) => {
    event.preventDefault()
    event.stopPropagation()
    setRenameError('')
    setSheetMenu({ sheetIndex, ...sheetMenuPosition(event.currentTarget) })
  }

  const beginRenameSheet = (sheetIndex, position = sheetMenu) => {
    setRenameDraft(sheets[sheetIndex].name)
    setRenameError('')
    setSheetMenu({ sheetIndex, left: position?.left ?? 8, bottom: position?.bottom ?? 46, mode: 'rename' })
  }

  const renameSheet = (sheetIndex) => {
    const name = renameDraft.trim()
    if (!name) return setRenameError('Enter a sheet name.')
    if (name.length > 31) return setRenameError('Use 31 characters or fewer.')
    if (['\\', '/', '?', '*', '[', ']', ':'].some((character) => name.includes(character))) return setRenameError('Remove \\ / ? * [ ] or :')
    if (sheets.some((sheet, index) => index !== sheetIndex && sheet.name.toLowerCase() === name.toLowerCase())) return setRenameError('That sheet name already exists.')
    const oldName = sheets[sheetIndex].name
    const renamedSheets = sheets.map((sheet, index) => index === sheetIndex ? { ...sheet, name } : sheet)
    const nextSheets = renameFormulaSheet(formulaEngine, oldName, name, renamedSheets)
    recordHistory()
    setSheets(nextSheets)
    setSheetMenu(null)
    notifyChange(nextSheets)
  }

  const deleteSheet = (sheetIndex) => {
    const deleting = sheets[sheetIndex]
    let remaining = sheets.filter((_, index) => index !== sheetIndex)
    if (!remaining.length) {
      const blankModel = createBlankModel()
      formulaEngine.setSheetContent(formulaEngine.getSheetId(deleting.name), gridFromSheetModel(blankModel))
      remaining = [{ name: deleting.name, model: blankModel }]
    } else {
      formulaEngine.removeSheet(formulaEngine.getSheetId(deleting.name))
    }
    const nextSheets = serializeWorkbookFormulaEngine(formulaEngine, remaining)
    const nextActiveSheet = remaining.length
      ? activeSheet > sheetIndex ? activeSheet - 1 : activeSheet === sheetIndex ? Math.min(sheetIndex, nextSheets.length - 1) : activeSheet
      : 0
    recordHistory()
    setSheets(nextSheets)
    setActiveSheet(nextActiveSheet)
    setSheetMenu(null)
    notifyChange(nextSheets)
  }

  const duplicateSheet = (sheetIndex) => {
    const source = sheets[sheetIndex]
    let counter = 2
    let name = `${source.name} (${counter})`
    while (sheets.some((sheet) => sheet.name.toLowerCase() === name.toLowerCase())) {
      counter += 1
      name = `${source.name} (${counter})`
    }
    const copy = {
      ...source,
      name,
      hidden: false,
      model: {
        ...source.model,
        rows: source.model.rows.map((row) => ({ ...row, values: [...row.values] })),
        formats: structuredClone(source.model.formats || {}),
        comments: structuredClone(source.model.comments || {}),
        merges: (source.model.merges || []).map((merge) => ({ ...merge })),
        colWidths: { ...(source.model.colWidths || {}) },
        rowHeights: { ...(source.model.rowHeights || {}) },
        view: { ...INITIAL_MODEL.view, ...(source.model.view || {}) },
      },
    }
    formulaEngine.addSheet(name)
    formulaEngine.setSheetContent(formulaEngine.getSheetId(name), gridFromSheetModel(copy.model))
    const nextSheets = [...sheets.slice(0, sheetIndex + 1), copy, ...sheets.slice(sheetIndex + 1)]
    recordHistory()
    setSheets(nextSheets)
    setActiveSheet(sheetIndex + 1)
    setSheetMenu(null)
    notifyChange(nextSheets)
  }

  const moveSheet = (sheetIndex, direction) => {
    const target = sheetIndex + direction
    if (target < 0 || target >= sheets.length) return
    const nextSheets = [...sheets]
    const [moved] = nextSheets.splice(sheetIndex, 1)
    nextSheets.splice(target, 0, moved)
    recordHistory()
    setSheets(nextSheets)
    setActiveSheet(target)
    setSheetMenu(null)
    notifyChange(nextSheets)
  }

  const hideSheet = (sheetIndex) => {
    if (sheets.filter((sheet) => !sheet.hidden).length <= 1) return
    const nextSheets = sheets.map((sheet, index) => index === sheetIndex ? { ...sheet, hidden: true } : sheet)
    const nextActive = nextSheets.findIndex((sheet) => !sheet.hidden)
    recordHistory()
    setSheets(nextSheets)
    setActiveSheet(nextActive)
    setSheetMenu(null)
    notifyChange(nextSheets)
  }

  const unhideSheet = (sheetIndex) => {
    const nextSheets = sheets.map((sheet, index) => index === sheetIndex ? { ...sheet, hidden: false } : sheet)
    recordHistory()
    setSheets(nextSheets)
    setActiveSheet(sheetIndex)
    notifyChange(nextSheets)
  }

  // Right-click menu. Callbacks read the latest handlers from a ref so the config
  // object stays stable (the grid is memoised on it). Handsontable selects the
  // clicked cell before the menu opens, so our React selection is current.
  const opsRef = useRef({})
  opsRef.current = {
    copySelection, cutSelection, pasteSelection, pasteSpecial, rememberSelection,
    addRowAbove, addRow, addColumnLeft, addColumn,
    deleteRows, deleteColumns, clearCells, mergeSelection,
    sortSelection, setAlign, promptRowHeight, promptColumnWidth,
  }
  const contextMenuConfig = useMemo(() => ({
    items: {
      copy: { name: 'Copy', callback: () => opsRef.current.copySelection() },
      cut: { name: 'Cut', callback: () => opsRef.current.cutSelection() },
      paste_cells: { name: 'Paste', callback: () => opsRef.current.pasteSelection() },
      paste_values: { name: 'Paste values', callback: () => opsRef.current.pasteSpecial('values') },
      paste_formats: { name: 'Paste formatting', callback: () => opsRef.current.pasteSpecial('formats') },
      sep_1: '---------',
      insert_row_above: { name: 'Insert row above', callback: () => opsRef.current.addRowAbove() },
      insert_row_below: { name: 'Insert row below', callback: () => opsRef.current.addRow() },
      insert_col_left: { name: 'Insert column left', callback: () => opsRef.current.addColumnLeft() },
      insert_col_right: { name: 'Insert column right', callback: () => opsRef.current.addColumn() },
      sep_2: '---------',
      delete_rows: { name: 'Delete row', callback: () => opsRef.current.deleteRows() },
      delete_cols: { name: 'Delete column', callback: () => opsRef.current.deleteColumns() },
      clear_contents: { name: 'Clear contents', callback: () => opsRef.current.clearCells() },
      sep_3: '---------',
      sort_asc: { name: 'Sort A → Z', callback: () => opsRef.current.sortSelection('asc') },
      sort_desc: { name: 'Sort Z → A', callback: () => opsRef.current.sortSelection('desc') },
      sep_4: '---------',
      merge_cells_toggle: { name: 'Merge / unmerge cells', callback: () => opsRef.current.mergeSelection() },
      cell_alignment: {
        name: 'Alignment',
        submenu: {
          items: [
            { key: 'cell_alignment:left', name: 'Left', callback: () => opsRef.current.setAlign('left') },
            { key: 'cell_alignment:center', name: 'Center', callback: () => opsRef.current.setAlign('center') },
            { key: 'cell_alignment:right', name: 'Right', callback: () => opsRef.current.setAlign('right') },
          ],
        },
      },
      sep_5: '---------',
      set_row_height: { name: 'Row height…', callback: () => opsRef.current.promptRowHeight() },
      set_col_width: { name: 'Column width…', callback: () => opsRef.current.promptColumnWidth() },
    },
  }), [])

  // Ctrl/Cmd+F (find) and Ctrl/Cmd+H (replace) open the in-app tool — but only
  // when focus is inside the spreadsheet. Elsewhere on the page they fall through
  // to the browser's native find, as the user expects.
  useEffect(() => {
    const onKeyDown = (event) => {
      const withinSheet = shellRef.current && (shellRef.current.contains(document.activeElement) || shellRef.current.contains(event.target))
      if (!(event.metaKey || event.ctrlKey)) {
        if (event.key === 'Escape' && withinSheet) {
          if (findOpen) setFindOpen(false)
          if (formatPainterRef.current) {
            formatPainterRef.current = null
            setFormatPainterActive(false)
          }
        }
        return
      }
      if (!withinSheet) return // outside the sheet → let the browser handle it
      const key = event.key.toLowerCase()
      if (key === 'f' || key === 'h') {
        event.preventDefault()
        openFind(key === 'h' ? 'replace' : 'find')
        return
      }
      // Undo / redo. Skip while editing a cell or typing in one of our own
      // inputs/selects, so native text undo still works there.
      const active = document.activeElement
      const editingCell = active?.classList?.contains('handsontableInput')
      const inFormField = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')
      if (editingCell || inFormField) return
      if (key === 'c' || key === 'x') {
        opsRef.current.rememberSelection()
        return
      }
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undoModel() }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redoModel() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, undoModel, redoModel])

  const renderRibbon = () => {
    const currentNf = Object.entries(NUMBER_FORMATS).find(([, pattern]) => pattern === (activeFormat.nf ?? null))?.[0] ?? 'general'
    const functionMenuItems = (names) => names
      .filter((name) => FUNCTION_INDEX.has(name))
      .map((name) => ({ label: name, onClick: () => insertFunction(name) }))

    if (activeRibbon === 'Insert') return <>
      <RibbonGroup label="Tables">
        <RibbonMenu icon="icon-table" label="Table" title="Format selection as a table" items={[
          { label: 'Green table style', onClick: () => formatSelectionAsTable('green') },
          { label: 'Blue table style', onClick: () => formatSelectionAsTable('blue') },
          { label: 'Gray table style', onClick: () => formatSelectionAsTable('gray') },
        ]} />
        <RibbonButton label="Sheet" title="Insert worksheet" onClick={addSheet} />
      </RibbonGroup>
      <RibbonGroup label="Controls">
        <RibbonButton label="Checkbox" title="Insert checkboxes" onClick={insertCheckboxes} />
      </RibbonGroup>
      <RibbonGroup label="Links">
        <RibbonButton label="Link" title="Insert hyperlink" onClick={insertHyperlink} />
      </RibbonGroup>
      <RibbonGroup label="Text">
        <RibbonMenu label="Date & Time" items={[
          { label: 'Current date', onClick: () => insertTimestamp('date') },
          { label: 'Current time', onClick: () => insertTimestamp('time') },
          { label: 'Current date and time', onClick: () => insertTimestamp('datetime') },
        ]} />
        <RibbonMenu label="Symbol" items={INSERT_SYMBOLS.map((symbol) => ({ label: symbol, onClick: () => insertSymbol(symbol) }))} />
      </RibbonGroup>
      <RibbonGroup label="Cells">
        <RibbonMenu icon="icon-plus" label="Insert" title="Insert cells" items={[
          { label: 'Insert row above', onClick: addRowAbove },
          { label: 'Insert row below', onClick: addRow },
          { label: 'Insert column left', onClick: addColumnLeft },
          { label: 'Insert column right', onClick: addColumn },
        ]} />
        <RibbonButton label="Merge" title="Merge / unmerge cells" onClick={mergeSelection} />
      </RibbonGroup>
    </>
    if (activeRibbon === 'Formulas') return <>
      <RibbonGroup label="Insert function">
        <RibbonButton label="fx" title="Insert function" onClick={() => setFxOpen(true)} />
        <RibbonMenu label="AutoSum" items={[
          { label: 'Sum', onClick: () => insertAggregate('SUM') },
          { label: 'Average', onClick: () => insertAggregate('AVERAGE') },
          { label: 'Count numbers', onClick: () => insertAggregate('COUNT') },
          { label: 'Maximum', onClick: () => insertAggregate('MAX') },
          { label: 'Minimum', onClick: () => insertAggregate('MIN') },
        ]} />
      </RibbonGroup>
      <RibbonGroup label="Function library">
        {FORMULA_RIBBON_GROUPS.map(([label, names]) => <RibbonMenu key={label} label={label} items={functionMenuItems(names)} />)}
        <RibbonButton label="More" title="Browse all functions" onClick={() => setFxOpen(true)} />
      </RibbonGroup>
      <RibbonGroup label="Formula auditing">
        <RibbonButton label="Show formulas" active={showFormulas} onClick={() => updateView({ showFormulas: !showFormulas })} />
        <RibbonButton label="Calculate" title="Calculate workbook now" onClick={calculateNow} />
      </RibbonGroup>
    </>
    if (activeRibbon === 'Data') return <>
      <RibbonGroup label="Sort & filter">
        <RibbonButton label="A → Z" title="Sort ascending" onClick={() => sortSelection('asc')} />
        <RibbonButton label="Z → A" title="Sort descending" onClick={() => sortSelection('desc')} />
        <RibbonButton label="Clear" title="Clear filters" onClick={clearFilters} />
      </RibbonGroup>
      <RibbonGroup label="Data tools">
        <RibbonButton label="Text to Columns" onClick={textToColumns} />
        <RibbonMenu label="Remove Duplicates" items={[
          { label: 'Selection has headers', onClick: () => removeDuplicates(true) },
          { label: 'Selection has no headers', onClick: () => removeDuplicates(false) },
        ]} />
        <RibbonButton label="Trim" title="Trim and normalize whitespace" onClick={trimWhitespace} />
      </RibbonGroup>
      <RibbonGroup label="Queries & calculation">
        <RibbonButton label="Refresh All" title="Recalculate workbook" onClick={calculateNow} />
        <RibbonButton icon="icon-search" label="Find" title="Find & replace (Ctrl+F)" onClick={() => openFind('find')} />
      </RibbonGroup>
    </>
    if (activeRibbon === 'Review') return <>
      <RibbonGroup label="Notes">
        <RibbonButton label={model.comments?.[cellKey(selection.row, selection.col)] ? 'Edit Note' : 'New Note'} onClick={editNote} />
        <RibbonButton label="Delete Note" danger onClick={deleteNote} />
      </RibbonGroup>
      <RibbonGroup label="Proofing">
        <RibbonButton label="Find" onClick={() => openFind('find')} />
        <RibbonButton label="Replace" onClick={() => openFind('replace')} />
      </RibbonGroup>
    </>
    if (activeRibbon === 'View') return <>
      <RibbonGroup label="Freeze panes">
        <RibbonMenu label="Freeze Panes" items={[
          { label: 'Freeze panes at selection', onClick: () => updateView({ fixedRowsTop: selection.row, fixedColumnsStart: selection.col }) },
          { label: 'Freeze top row', onClick: () => updateView({ fixedRowsTop: 1 }) },
          { label: 'Freeze first column', onClick: () => updateView({ fixedColumnsStart: 1 }) },
          { sep: true },
          { label: 'Unfreeze panes', onClick: () => updateView({ fixedRowsTop: 0, fixedColumnsStart: 0 }) },
        ]} />
      </RibbonGroup>
      <RibbonGroup label="Show">
        <RibbonButton label="Gridlines" active={showGridlines} onClick={() => updateView({ showGridlines: !showGridlines })} />
        <RibbonButton label="Headings" active={showHeaders} onClick={() => updateView({ showHeaders: !showHeaders })} />
        <RibbonButton label="Formulas" title="Show formulas instead of results" active={showFormulas} onClick={() => updateView({ showFormulas: !showFormulas })} />
        {sheets.some((sheet) => sheet.hidden) && <RibbonMenu label="Unhide" items={sheets.flatMap((sheet, index) => sheet.hidden ? [{ label: sheet.name, onClick: () => unhideSheet(index) }] : [])} />}
      </RibbonGroup>
      <RibbonGroup label="Zoom">
        <RibbonButton label="Fit columns" title="AutoFit column width" onClick={fitColumns} />
        <RibbonMenu label="Zoom" items={[50, 75, 100, 125, 150, 200].map((value) => ({ label: `${value}%`, onClick: () => updateView({ zoom: value }) }))} />
        <RibbonButton label="Full Screen" onClick={toggleFullScreen} />
      </RibbonGroup>
    </>
    return <>
      <RibbonGroup label="Clipboard">
        <RibbonMenu icon="icon-clipboard" label="Paste" items={[
          { label: 'Paste', onClick: pasteSelection },
          { sep: true },
          { label: 'Paste all', onClick: () => pasteSpecial('all') },
          { label: 'Paste formulas', onClick: () => pasteSpecial('formulas') },
          { label: 'Paste values', onClick: () => pasteSpecial('values') },
          { label: 'Paste formatting', onClick: () => pasteSpecial('formats') },
          { label: 'Transpose values', onClick: () => pasteSpecial('transpose') },
        ]} />
        <RibbonButton icon="icon-scissors" label="Cut" onClick={cutSelection} />
        <RibbonButton icon="icon-copy" label="Copy" onClick={copySelection} />
        <RibbonButton label="Painter" title="Format Painter" active={formatPainterActive} onClick={startFormatPainter} />
      </RibbonGroup>
      <RibbonGroup label="Font">
        <select className="excel-ribbon-select" title="Font" value={activeFormat.ff || 'Arial'} onChange={(event) => setFontFamily(event.target.value)}>
          {FONT_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
        </select>
        <select className="excel-ribbon-select narrow" title="Font size" value={activeFormat.fs || DEFAULT_FONT_SIZE} onChange={(event) => setFontSize(event.target.value)}>
          {FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <button type="button" className="excel-ribbon-button font-step" title="Increase font size" onClick={() => changeFontSize(1)}><span style={{ fontSize: '15px' }}>A</span></button>
        <button type="button" className="excel-ribbon-button font-step" title="Decrease font size" onClick={() => changeFontSize(-1)}><span style={{ fontSize: '10px' }}>A</span></button>
        <RibbonButton icon="icon-bold" label="Bold" active={Boolean(activeFormat.b)} onClick={() => toggleBool('b')} />
        <RibbonButton icon="icon-italic" label="Italic" active={Boolean(activeFormat.i)} onClick={() => toggleBool('i')} />
        <RibbonButton icon="icon-underline" label="Underline" active={Boolean(activeFormat.u)} onClick={() => toggleBool('u')} />
        <RibbonButton icon="icon-strikethrough" label="Strike" active={Boolean(activeFormat.s)} onClick={() => toggleBool('s')} />
        <RibbonMenu label="Borders" title="Borders" items={[
          { label: 'All borders', onClick: () => applyBorders('all') },
          { label: 'Outline', onClick: () => applyBorders('outline') },
          { label: 'Top border', onClick: () => applyBorders('top') },
          { label: 'Bottom border', onClick: () => applyBorders('bottom') },
          { label: 'Left border', onClick: () => applyBorders('left') },
          { label: 'Right border', onClick: () => applyBorders('right') },
          { sep: true },
          { label: 'No border', onClick: () => applyBorders('none') },
        ]} />
        <label className="excel-color-control fill" title="Fill color"><span>▰</span><input type="color" defaultValue="#fff2cc" onChange={(event) => setColor('bg', event.target.value)} /></label>
        <label className="excel-color-control" title="Font color"><span>A</span><input type="color" defaultValue="#1f1f1f" onChange={(event) => setColor('c', event.target.value)} /></label>
      </RibbonGroup>
      <RibbonGroup label="Alignment">
        <RibbonButton label="Top" title="Top align" active={activeFormat.va === 'top'} onClick={() => setVAlign('top')} />
        <RibbonButton label="Middle" title="Middle align" active={activeFormat.va === 'middle'} onClick={() => setVAlign('middle')} />
        <RibbonButton label="Bottom" title="Bottom align" active={activeFormat.va === 'bottom'} onClick={() => setVAlign('bottom')} />
        <RibbonButton label="Left" active={activeFormat.a === 'left'} onClick={() => setAlign('left')} />
        <RibbonButton label="Center" active={activeFormat.a === 'center'} onClick={() => setAlign('center')} />
        <RibbonButton label="Right" active={activeFormat.a === 'right'} onClick={() => setAlign('right')} />
        <RibbonButton label="Wrap" title="Wrap text" active={Boolean(activeFormat.w)} onClick={() => toggleBool('w')} />
        <RibbonButton label="Merge" title="Merge / unmerge cells" onClick={mergeSelection} />
      </RibbonGroup>
      <RibbonGroup label="Number">
        <select className="excel-ribbon-select wide" title="Number format" value={currentNf} onChange={(event) => setNumberFormat(event.target.value)}>
          {NUMBER_FORMAT_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <RibbonButton label="$" title="Currency" onClick={() => setNumberFormat('currency')} />
        <RibbonButton label="%" title="Percent" onClick={() => setNumberFormat('percent')} />
        <RibbonButton label="," title="Comma" onClick={() => setNumberFormat('comma')} />
        <RibbonButton label="+.0" title="Increase decimals" onClick={() => changeDecimals(1)} />
        <RibbonButton label="-.0" title="Decrease decimals" onClick={() => changeDecimals(-1)} />
      </RibbonGroup>
      <RibbonGroup label="Cells">
        <RibbonMenu label="Insert" title="Insert" items={[
          { label: 'Insert row above', onClick: addRowAbove },
          { label: 'Insert row below', onClick: addRow },
          { label: 'Insert column left', onClick: addColumnLeft },
          { label: 'Insert column right', onClick: addColumn },
          { sep: true },
          { label: 'Insert sheet', onClick: addSheet },
        ]} />
        <RibbonMenu label="Delete" title="Delete" items={[
          { label: 'Delete rows', danger: true, onClick: deleteRows },
          { label: 'Delete columns', danger: true, onClick: deleteColumns },
        ]} />
        <RibbonMenu label="Format" title="Format" items={[
          { label: 'Row height…', onClick: promptRowHeight },
          { label: 'Column width…', onClick: promptColumnWidth },
          { sep: true },
          { label: 'AutoFit column width', onClick: fitColumns },
        ]} />
      </RibbonGroup>
      <RibbonGroup label="Editing">
        <RibbonButton label="Σ" title="AutoSum" onClick={autoSum} />
        <RibbonMenu icon="icon-arrow-up-down" label="Sort & Filter" title="Sort & filter" items={[
          { label: 'Sort A → Z', onClick: () => sortSelection('asc') },
          { label: 'Sort Z → A', onClick: () => sortSelection('desc') },
          { sep: true },
          { label: 'Clear filters', onClick: clearFilters },
        ]} />
        <RibbonMenu icon="icon-search" label="Find & Select" title="Find & select" items={[
          { label: 'Find…', onClick: () => openFind('find') },
          { label: 'Replace…', onClick: () => openFind('replace') },
          { sep: true },
          { label: 'Clear contents', onClick: clearCells },
          { label: 'Clear formats', onClick: clearFormatting },
        ]} />
      </RibbonGroup>
    </>
  }

  useEffect(() => {
    if (!sheetMenu) return
    const closeOnPointerDown = (event) => {
      if (!sheetMenuRef.current?.contains(event.target)) setSheetMenu(null)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSheetMenu(null)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [sheetMenu])

  useEffect(() => {
    if (sheetMenu?.mode !== 'rename') return
    requestAnimationFrame(() => {
      renameInputRef.current?.focus({ preventScroll: true })
      renameInputRef.current?.select()
    })
  }, [sheetMenu])

  const sheetMenuOverlay = typeof document !== 'undefined' && sheetMenu && sheets[sheetMenu.sheetIndex]
    ? createPortal(<div
      ref={sheetMenuRef}
      className="spreadsheet-sheet-menu"
      style={{ left: sheetMenu.left, bottom: sheetMenu.bottom }}
      role="menu"
      aria-label={`${sheets[sheetMenu.sheetIndex].name} options`}
    >
      {sheetMenu.mode === 'rename' ? <form className="spreadsheet-sheet-rename" onSubmit={(event) => { event.preventDefault(); renameSheet(sheetMenu.sheetIndex) }}>
        <label htmlFor={`sheet-name-${sheetMenu.sheetIndex}`}>Sheet name</label>
        <input ref={renameInputRef} id={`sheet-name-${sheetMenu.sheetIndex}`} value={renameDraft} onChange={(event) => { setRenameDraft(event.target.value); setRenameError('') }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setSheetMenu(null) } }} aria-invalid={Boolean(renameError)} aria-describedby={renameError ? `sheet-name-error-${sheetMenu.sheetIndex}` : undefined} />
        {renameError && <span id={`sheet-name-error-${sheetMenu.sheetIndex}`} className="spreadsheet-sheet-rename-error" role="alert">{renameError}</span>}
        <div className="spreadsheet-sheet-rename-actions"><button type="button" onClick={() => setSheetMenu((current) => ({ ...current, mode: undefined }))}>Cancel</button><button type="submit" className="primary">Save</button></div>
      </form> : <>
        <button className="spreadsheet-sheet-menu-item" type="button" role="menuitem" onClick={() => beginRenameSheet(sheetMenu.sheetIndex)}><i className="icon-pencil text-xs"></i><span>Rename</span></button>
        <button className="spreadsheet-sheet-menu-item" type="button" role="menuitem" onClick={() => duplicateSheet(sheetMenu.sheetIndex)}><i className="icon-copy text-xs"></i><span>Duplicate</span></button>
        <button className="spreadsheet-sheet-menu-item" type="button" role="menuitem" disabled={sheetMenu.sheetIndex === 0} onClick={() => moveSheet(sheetMenu.sheetIndex, -1)}><span>←</span><span>Move left</span></button>
        <button className="spreadsheet-sheet-menu-item" type="button" role="menuitem" disabled={sheetMenu.sheetIndex === sheets.length - 1} onClick={() => moveSheet(sheetMenu.sheetIndex, 1)}><span>→</span><span>Move right</span></button>
        <button className="spreadsheet-sheet-menu-item" type="button" role="menuitem" disabled={sheets.filter((sheet) => !sheet.hidden).length <= 1} onClick={() => hideSheet(sheetMenu.sheetIndex)}><span>◌</span><span>Hide</span></button>
        <button className="spreadsheet-sheet-menu-item danger" type="button" role="menuitem" onClick={() => deleteSheet(sheetMenu.sheetIndex)}><i className="icon-trash-2 text-xs"></i><span>Delete</span></button>
      </>}
    </div>, document.body)
    : null

  const functionOverlay = typeof document !== 'undefined' && fxOpen
    ? createPortal(<div className="spreadsheet-modal-backdrop" role="presentation" onClick={() => setFxOpen(false)}>
      <div className="spreadsheet-fx-panel" role="dialog" aria-modal="true" aria-label="Insert function" onClick={(event) => event.stopPropagation()}>
        <div className="spreadsheet-fx-header">
          <span>Insert function</span>
          <button type="button" onClick={() => setFxOpen(false)} aria-label="Close"><i className="icon-x"></i></button>
        </div>
        <input autoFocus className="spreadsheet-fx-search" value={fxQuery} onChange={(event) => setFxQuery(event.target.value)} placeholder="Search functions…" />
        <div className="spreadsheet-fx-list">
          {fxResults.length === 0 && <p className="spreadsheet-fx-empty">No functions match.</p>}
          {fxResults.map((group) => <div key={group.category} className="spreadsheet-fx-group">
            <div className="spreadsheet-fx-category">{group.category}</div>
            {group.items.map((item) => <button key={item.name} type="button" className="spreadsheet-fx-item" onClick={() => insertFunction(item.name)}>
              <span className="spreadsheet-fx-name">{item.syntax || item.name}</span>
              <span className="spreadsheet-fx-desc">{item.desc}</span>
            </button>)}
          </div>)}
        </div>
      </div>
    </div>, document.body)
    : null

  return <div ref={shellRef} className="excel-workbook-shell">
    <div className="excel-titlebar">
      <div className="excel-app-mark">X</div>
      <div className="excel-qat">
        <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undoModel}><i className="icon-undo-2"></i></button>
        <button type="button" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redoModel}><i className="icon-redo-2"></i></button>
      </div>
      <input aria-label="Spreadsheet filename" className="spreadsheet-file-name" value={fileName} onChange={(event) => updateFileName(event.target.value)} onBlur={() => { if (!fileName.trim()) updateFileName(DEFAULT_FILE_NAME) }} />
      <div className="excel-title-actions">
        <input ref={fileInputRef} onChange={importWorkbook} accept=".xlsx,.xls" type="file" className="hidden" />
        <span className="excel-saved-state">Saved with draft</span>
        <button type="button" onClick={() => fileInputRef.current?.click()}><i className="icon-upload"></i><span>Open</span></button>
        <button type="button" className="primary" onClick={exportWorkbook}><i className="icon-download"></i><span>Download</span></button>
      </div>
    </div>

    <div className="excel-ribbon-tabs" role="tablist" aria-label="Spreadsheet tools">
      {['Home', 'Insert', 'Formulas', 'Data', 'Review', 'View'].map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeRibbon === tab} className={activeRibbon === tab ? 'active' : ''} onClick={() => setActiveRibbon(tab)}>{tab}</button>)}
    </div>
    <div className="excel-ribbon" role="tabpanel">{renderRibbon()}</div>

    <div className="excel-formula-row">
      <form onSubmit={jumpToAddress}><input aria-label="Name box" className="excel-name-box" value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} /></form>
      <button type="button" className="excel-formula-icon" aria-label="Insert function" title="Insert Function" onClick={() => setFxOpen(true)}>fx</button>
      <div className="spreadsheet-formula-wrap">
        <input
          ref={formulaBarRef}
          aria-label="Formula bar"
          className="spreadsheet-formula-bar"
          value={selectedValue}
          onFocus={() => {
            if (!formulaEditing) setFormulaDraft(selectedCellValue)
            setFormulaEditing(true)
          }}
          onBlur={commitFormulaBar}
          onChange={(event) => setFormulaDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitFormulaBar()
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setFormulaDraft(selectedCellValue)
              setFormulaEditing(false)
              return
            }
            if (event.key !== 'F4') return
            const input = event.currentTarget
            const result = cycleAbsoluteReference(input.value, input.selectionStart || 0)
            if (!result) return
            event.preventDefault()
            setFormulaDraft(result.value)
            requestAnimationFrame(() => input.setSelectionRange(result.caret, result.caret))
          }}
          placeholder="Enter a value or formula"
          autoComplete="off"
        />
        {formulaAutocomplete && <div className="spreadsheet-formula-suggestions" role="listbox" aria-label="Formula suggestions">
          {formulaAutocomplete.items.map((item) => <button key={item.name} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => acceptFormulaSuggestion(item.name)}>
            <span>{item.name}</span><small>{item.desc}</small>
          </button>)}
        </div>}
      </div>
    </div>

    {findOpen && <div className="spreadsheet-find-bar" role="search">
      <span className="spreadsheet-find-title">{findMode === 'replace' ? 'Find & Replace' : 'Find'}</span>
      <input ref={findInputRef} className="spreadsheet-find-input" value={findTerm} onChange={(event) => { setFindTerm(event.target.value); setFindStatus('') }} onKeyDown={(event) => { if (event.key === 'Enter') findNext() }} placeholder="Find what" aria-label="Find what" />
      {findMode === 'replace' && <input className="spreadsheet-find-input" value={replaceTerm} onChange={(event) => setReplaceTerm(event.target.value)} placeholder="Replace with" aria-label="Replace with" />}
      <button type="button" onClick={findNext}>Find next</button>
      {findMode === 'replace' && <><button type="button" onClick={replaceCurrent}>Replace</button><button type="button" onClick={replaceAll}>Replace all</button></>}
      {findMode === 'find'
        ? <button type="button" className="spreadsheet-find-link" onClick={() => openFind('replace')}>Replace ▾</button>
        : <button type="button" className="spreadsheet-find-link" onClick={() => setFindMode('find')}>Find ▴</button>}
      <label className="spreadsheet-find-toggle"><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /> Match case</label>
      <label className="spreadsheet-find-toggle"><input type="checkbox" checked={allSheets} onChange={(event) => setAllSheets(event.target.checked)} /> All sheets</label>
      {findStatus && <span className="spreadsheet-find-status">{findStatus}</span>}
      <button type="button" className="spreadsheet-find-close" onClick={() => setFindOpen(false)} aria-label="Close find and replace"><i className="icon-x"></i></button>
    </div>}

    <div className="spreadsheet-hot" style={{ zoom: zoom / 100 }}>
      <SpreadsheetGrid
        data={gridData}
        columnCount={columnCount}
        fixedRowsTop={fixedRowsTop}
        fixedColumnsStart={fixedColumnsStart}
        formats={model.formats}
        notes={model.comments}
        merges={mergesProp}
        colWidths={model.colWidths}
        rowHeights={model.rowHeights}
        contextMenu={contextMenuConfig}
        showHeaders={showHeaders}
        showGridlines={showGridlines}
        showFormulas={showFormulas}
        formulaEngine={formulaEngine}
        sheetName={sheets[activeSheet].name}
        hotRef={hotRef}
        onSelection={handleSelection}
        onGridChange={handleGridChange}
        onColWidth={handleColWidth}
        onRowHeight={handleRowHeight}
        onRememberSelection={rememberSelection}
        onGridReorder={handleGridReorder}
      />
    </div>

    <div className="excel-bottom-bar">
      <div className="spreadsheet-sheets">
        <button onClick={addSheet} className="excel-add-sheet" title="New worksheet" aria-label="New worksheet"><i className="icon-plus"></i></button>
        {sheets.map((sheet, index) => sheet.hidden ? null : <div key={sheet.name} className="spreadsheet-sheet-tab-wrap">
          <button
            onClick={() => { setActiveSheet(index); setSheetMenu(null) }}
            onDoubleClick={(event) => beginRenameSheet(index, sheetMenuPosition(event.currentTarget))}
            onContextMenu={(event) => openSheetMenu(event, index)}
            className={`spreadsheet-sheet-tab ${index === activeSheet ? 'active' : ''}`}
            aria-current={index === activeSheet ? 'page' : undefined}
            aria-haspopup="menu"
            aria-expanded={sheetMenu?.sheetIndex === index}
          >{sheet.name}</button>
        </div>)}
      </div>
      <div className="excel-status-bar">
        {selectedNumbers.length > 0 && <><span>Average: {(selectedNumbers.reduce((sum, value) => sum + value, 0) / selectedNumbers.length).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><span>Count: {selectedNumbers.length}</span><span>Sum: {selectedNumbers.reduce((sum, value) => sum + value, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></>}
        <div className="excel-zoom">
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => updateView({ zoom: Math.max(50, zoom - 10) })}>−</button>
          <span className="excel-zoom-value">{zoom}%</span>
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => updateView({ zoom: Math.min(200, zoom + 10) })}>+</button>
        </div>
      </div>
    </div>
    {sheetMenuOverlay}
    {functionOverlay}
  </div>
}
