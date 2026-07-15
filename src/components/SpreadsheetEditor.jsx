'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HotTable } from '@handsontable/react-wrapper'
import { HyperFormula } from 'hyperformula'
import { registerAllModules } from 'handsontable/registry'
import * as XLSX from 'xlsx'
import 'handsontable/styles/handsontable.min.css'
import 'handsontable/styles/ht-theme-main.min.css'

registerAllModules()

const FORMULAS_CONFIG = { engine: HyperFormula, sheetName: 'Model' }
const DEFAULT_FILE_NAME = 'model.xlsx'
const DEFAULT_ROWS = 30
const DEFAULT_COLUMNS = 12

const createBlankModel = (rowCount = DEFAULT_ROWS, columnCount = DEFAULT_COLUMNS) => ({
  headers: Array(Math.max(columnCount - 1, 0)).fill(''),
  rows: Array.from({ length: rowCount }, () => ({ label: '', values: Array(Math.max(columnCount - 1, 0)).fill('') })),
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

const columnLabel = (index) => {
  let label = ''
  let value = index + 1
  while (value > 0) {
    value -= 1
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26)
  }
  return label
}

const columnIndex = (label) => {
  let value = 0
  for (const character of label.toUpperCase()) value = value * 26 + character.charCodeAt(0) - 64
  return value - 1
}

const boundsOf = ({ row, col, row2, col2 }) => ({
  top: Math.min(row, row2),
  bottom: Math.max(row, row2),
  left: Math.min(col, col2),
  right: Math.max(col, col2),
})

const migrateModel = (model) => {
  if (!model?.rows) return INITIAL_MODEL
  const headers = Array.isArray(model.headers) ? model.headers : []
  if (!headers.some((header) => String(header).trim())) return toModel(toGrid(model), Math.max(headers.length + 1, 1))
  return toModel([['', ...headers], ...toGrid(model)], headers.length + 1)
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

const SpreadsheetGrid = memo(function SpreadsheetGrid({ data, columnCount, fixedRowsTop, hotRef, onSelection, onGridChange }) {
  return <HotTable
    ref={hotRef}
    data={data}
    colHeaders={(index) => columnLabel(index)}
    rowHeaders
    width="100%"
    height={520}
    colWidths={104}
    rowHeights={23}
    rowHeaderWidth={46}
    stretchH="none"
    contextMenu
    copyPaste
    fillHandle
    undoRedo
    mergeCells
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
    minCols={columnCount}
    formulas={FORMULAS_CONFIG}
    licenseKey="non-commercial-and-evaluation"
    className="ht-theme-main spreadsheet-grid-theme"
    afterSelectionEnd={onSelection}
    afterRenderer={(td, row, col, prop, value, cellProperties) => {
      td.style.backgroundColor = cellProperties.cellBackground || ''
      td.style.color = cellProperties.cellColor || ''
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

export default function SpreadsheetEditor({ initialModel, onChange }) {
  const [sheets, setSheets] = useState(() => {
    if (initialModel?.sheets) return initialModel.sheets.map((sheet) => ({ ...sheet, model: migrateModel(sheet.model) }))
    return [{ name: 'Sheet1', model: migrateModel(initialModel || INITIAL_MODEL) }]
  })
  const [fileName, setFileName] = useState(initialModel?.filename || DEFAULT_FILE_NAME)
  const [activeSheet, setActiveSheet] = useState(0)
  const [activeRibbon, setActiveRibbon] = useState('Home')
  const [selection, setSelection] = useState({ row: 0, col: 0, row2: 0, col2: 0 })
  const [addressDraft, setAddressDraft] = useState('A1')
  const [sheetMenu, setSheetMenu] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [fixedRowsTop, setFixedRowsTop] = useState(0)
  const hotRef = useRef(null)
  const fileInputRef = useRef(null)
  const sheetMenuRef = useRef(null)
  const renameInputRef = useRef(null)
  const model = sheets[activeSheet]?.model || INITIAL_MODEL
  const gridData = useMemo(() => toGrid(model), [model])
  const columnCount = Math.max(model.headers.length + 1, 1)
  const range = boundsOf(selection)
  const selectedValue = gridData[selection.row]?.[selection.col] ?? ''
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

  const notifyChange = useCallback((nextSheets, nextFileName = fileName) => {
    onChange?.({ filename: nextFileName, sheets: nextSheets })
  }, [fileName, onChange])

  const update = useCallback((next) => {
    const nextSheets = sheets.map((sheet, index) => index === activeSheet ? { ...sheet, model: next } : sheet)
    setSheets(nextSheets)
    notifyChange(nextSheets)
  }, [activeSheet, notifyChange, sheets])

  const updateFileName = (name) => {
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
    update(toModel(data, columnCount))
  }, [columnCount, update])

  const setSelectedValue = (value) => {
    const data = toGrid(model)
    if (!data[selection.row]) return
    data[selection.row][selection.col] = value
    update(toModel(data, columnCount))
  }

  const jumpToAddress = (event) => {
    event.preventDefault()
    const match = addressDraft.trim().match(/^([A-Za-z]+)(\d+)$/)
    if (!match) return setAddressDraft(selectedAddress)
    const col = columnIndex(match[1])
    const row = Number(match[2]) - 1
    if (row < 0 || row >= gridData.length || col < 0 || col >= columnCount) return setAddressDraft(selectedAddress)
    hotRef.current?.hotInstance?.selectCell(row, col)
  }

  const forEachSelectedCell = (callback) => {
    const instance = hotRef.current?.hotInstance
    if (!instance) return
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) callback(instance, row, col)
    }
    instance.render()
  }

  const toggleClass = (className, exclusive = []) => forEachSelectedCell((instance, row, col) => {
    const current = String(instance.getCellMeta(row, col).className || '').split(/\s+/).filter(Boolean)
    const hasClass = current.includes(className)
    const next = current.filter((item) => item !== className && !exclusive.includes(item))
    if (!hasClass) next.push(className)
    instance.setCellMeta(row, col, 'className', next.join(' '))
  })

  const setCellColor = (property, value) => forEachSelectedCell((instance, row, col) => instance.setCellMeta(row, col, property, value))

  const setNumberFormat = (pattern) => forEachSelectedCell((instance, row, col) => {
    instance.setCellMeta(row, col, 'type', 'numeric')
    instance.setCellMeta(row, col, 'numericFormat', { pattern, culture: 'en-US' })
  })

  const clearFormatting = () => forEachSelectedCell((instance, row, col) => {
    for (const key of ['className', 'type', 'numericFormat', 'cellBackground', 'cellColor']) instance.removeCellMeta(row, col, key)
  })

  const addRow = () => {
    const insertAt = Math.min(range.bottom + 1, model.rows.length)
    const rows = [...model.rows]
    rows.splice(insertAt, 0, { label: '', values: Array(columnCount - 1).fill('') })
    update({ ...model, rows })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(insertAt, range.left))
  }

  const deleteRows = () => {
    const rows = model.rows.filter((_, index) => index < range.top || index > range.bottom)
    const nextRows = rows.length ? rows : createBlankModel(1, columnCount).rows
    update({ ...model, rows: nextRows })
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(Math.min(range.top, nextRows.length - 1), Math.min(range.left, columnCount - 1)))
  }

  const addColumn = () => {
    const insertAt = Math.min(range.right + 1, columnCount)
    const data = toGrid(model).map((row) => {
      const next = [...row]
      next.splice(insertAt, 0, '')
      return next
    })
    update(toModel(data, columnCount + 1))
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(range.top, insertAt))
  }

  const deleteColumns = () => {
    const deleteCount = range.right - range.left + 1
    if (columnCount - deleteCount < 1) return
    const data = toGrid(model).map((row) => row.filter((_, index) => index < range.left || index > range.right))
    const nextColumnCount = columnCount - deleteCount
    update(toModel(data, nextColumnCount))
    requestAnimationFrame(() => hotRef.current?.hotInstance?.selectCell(range.top, Math.min(range.left, nextColumnCount - 1)))
  }

  const clearCells = () => {
    const data = toGrid(model)
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) data[row][col] = ''
    }
    update(toModel(data, columnCount))
  }

  const mergeSelection = () => {
    const plugin = hotRef.current?.hotInstance?.getPlugin('mergeCells')
    if (!plugin || (range.top === range.bottom && range.left === range.right)) return
    plugin.merge(range.top, range.left, range.bottom, range.right)
    hotRef.current?.hotInstance?.render()
  }

  const sortSelection = (sortOrder) => {
    hotRef.current?.hotInstance?.getPlugin('columnSorting')?.sort({ column: selection.col, sortOrder })
  }

  const clearFilters = () => {
    const filters = hotRef.current?.hotInstance?.getPlugin('filters')
    filters?.clearConditions()
    filters?.filter()
  }

  const importWorkbook = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true })
      const nextSheets = workbook.SheetNames.map((name) => {
        const rows = workbookRows(workbook.Sheets[name])
        const importedColumnCount = Math.max(DEFAULT_COLUMNS, ...rows.map((row) => row.length), 1)
        const paddedRows = rows.length ? rows : createBlankModel(DEFAULT_ROWS, importedColumnCount).rows.map((row) => [row.label, ...row.values])
        return { name, model: toModel(paddedRows, importedColumnCount) }
      })
      setSheets(nextSheets)
      setActiveSheet(0)
      setFileName(file.name)
      notifyChange(nextSheets, file.name)
    } catch {
      window.alert('This file could not be read as an Excel workbook.')
    }
    event.target.value = ''
  }

  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new()
    sheets.forEach(({ name, model: sheetModel }) => {
      const sheet = XLSX.utils.aoa_to_sheet(toGrid(sheetModel))
      sheetModel.rows.forEach((row, rowIndex) => [row.label, ...row.values].forEach((value, colIndex) => {
        if (String(value).startsWith('=')) sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })] = { t: 'n', f: String(value).slice(1) }
      }))
      XLSX.utils.book_append_sheet(workbook, sheet, name)
    })
    const exportName = fileName.trim() || DEFAULT_FILE_NAME
    XLSX.writeFile(workbook, /\.xlsx$/i.test(exportName) ? exportName : `${exportName}.xlsx`)
  }

  const addSheet = () => {
    let number = sheets.length + 1
    while (sheets.some((sheet) => sheet.name === `Sheet${number}`)) number += 1
    const nextSheets = [...sheets, { name: `Sheet${number}`, model: createBlankModel(DEFAULT_ROWS, columnCount) }]
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
    const nextSheets = sheets.map((sheet, index) => index === sheetIndex ? { ...sheet, name } : sheet)
    setSheets(nextSheets)
    setSheetMenu(null)
    notifyChange(nextSheets)
  }

  const deleteSheet = (sheetIndex) => {
    const remaining = sheets.filter((_, index) => index !== sheetIndex)
    const nextSheets = remaining.length ? remaining : [{ name: 'Sheet1', model: createBlankModel() }]
    const nextActiveSheet = remaining.length
      ? activeSheet > sheetIndex ? activeSheet - 1 : activeSheet === sheetIndex ? Math.min(sheetIndex, nextSheets.length - 1) : activeSheet
      : 0
    setSheets(nextSheets)
    setActiveSheet(nextActiveSheet)
    setSheetMenu(null)
    notifyChange(nextSheets)
  }

  const renderRibbon = () => {
    if (activeRibbon === 'Insert') return <>
      <RibbonGroup label="Cells">
        <RibbonButton icon="icon-plus" label="Row below" onClick={addRow} />
        <RibbonButton icon="icon-plus" label="Column right" onClick={addColumn} />
        <RibbonButton icon="icon-plus" label="Worksheet" onClick={addSheet} />
      </RibbonGroup>
      <RibbonGroup label="Structure">
        <RibbonButton label="Merge cells" onClick={mergeSelection} />
        <RibbonButton label="Delete rows" danger onClick={deleteRows} />
        <RibbonButton label="Delete columns" danger onClick={deleteColumns} />
      </RibbonGroup>
    </>
    if (activeRibbon === 'Data') return <>
      <RibbonGroup label="Sort & filter">
        <RibbonButton label="A → Z" onClick={() => sortSelection('asc')} />
        <RibbonButton label="Z → A" onClick={() => sortSelection('desc')} />
        <RibbonButton label="Clear filters" onClick={clearFilters} />
      </RibbonGroup>
      <RibbonGroup label="Data tools">
        <RibbonButton label="Clear cells" danger onClick={clearCells} />
      </RibbonGroup>
    </>
    if (activeRibbon === 'View') return <>
      <RibbonGroup label="Window">
        <RibbonButton label={fixedRowsTop ? 'Unfreeze row' : 'Freeze top row'} active={Boolean(fixedRowsTop)} onClick={() => setFixedRowsTop((value) => value ? 0 : 1)} />
      </RibbonGroup>
      <RibbonGroup label="Workbook">
        <RibbonButton label="Fit columns" onClick={() => hotRef.current?.hotInstance?.getPlugin('autoColumnSize')?.recalculateAllColumnsWidth()} />
      </RibbonGroup>
    </>
    return <>
      <RibbonGroup label="History">
        <RibbonButton icon="icon-undo-2" label="Undo" onClick={() => hotRef.current?.hotInstance?.getPlugin('undoRedo')?.undo()} />
        <RibbonButton icon="icon-redo-2" label="Redo" onClick={() => hotRef.current?.hotInstance?.getPlugin('undoRedo')?.redo()} />
      </RibbonGroup>
      <RibbonGroup label="Font">
        <RibbonButton icon="icon-bold" label="Bold" onClick={() => toggleClass('cell-bold')} />
        <RibbonButton icon="icon-italic" label="Italic" onClick={() => toggleClass('cell-italic')} />
        <RibbonButton icon="icon-underline" label="Underline" onClick={() => toggleClass('cell-underline')} />
        <label className="excel-color-control" title="Text color"><span>A</span><input type="color" defaultValue="#1f1f1f" onChange={(event) => setCellColor('cellColor', event.target.value)} /></label>
        <label className="excel-color-control fill" title="Fill color"><span>▰</span><input type="color" defaultValue="#fff2cc" onChange={(event) => setCellColor('cellBackground', event.target.value)} /></label>
      </RibbonGroup>
      <RibbonGroup label="Alignment">
        <RibbonButton label="Left" onClick={() => toggleClass('htLeft', ['htCenter', 'htRight'])} />
        <RibbonButton label="Center" onClick={() => toggleClass('htCenter', ['htLeft', 'htRight'])} />
        <RibbonButton label="Right" onClick={() => toggleClass('htRight', ['htLeft', 'htCenter'])} />
      </RibbonGroup>
      <RibbonGroup label="Number">
        <RibbonButton label="$" title="Currency" onClick={() => setNumberFormat('$0,0.00')} />
        <RibbonButton label="%" title="Percentage" onClick={() => setNumberFormat('0.00%')} />
        <RibbonButton label="1,000" title="Thousands separator" onClick={() => setNumberFormat('0,0.00')} />
      </RibbonGroup>
      <RibbonGroup label="Editing">
        <RibbonButton label="Clear" onClick={clearCells} />
        <RibbonButton label="Clear format" onClick={clearFormatting} />
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
        <button className="spreadsheet-sheet-menu-item danger" type="button" role="menuitem" onClick={() => deleteSheet(sheetMenu.sheetIndex)}><i className="icon-trash-2 text-xs"></i><span>Delete</span></button>
      </>}
    </div>, document.body)
    : null

  return <div className="excel-workbook-shell">
    <div className="excel-titlebar">
      <div className="excel-app-mark">X</div>
      <input aria-label="Spreadsheet filename" className="spreadsheet-file-name" value={fileName} onChange={(event) => updateFileName(event.target.value)} onBlur={() => { if (!fileName.trim()) updateFileName(DEFAULT_FILE_NAME) }} />
      <span className="excel-saved-state">Saved with draft</span>
      <div className="excel-title-actions">
        <input ref={fileInputRef} onChange={importWorkbook} accept=".xlsx,.xls" type="file" className="hidden" />
        <button type="button" onClick={() => fileInputRef.current?.click()}><i className="icon-upload"></i><span>Open</span></button>
        <button type="button" className="primary" onClick={exportWorkbook}><i className="icon-download"></i><span>Download</span></button>
      </div>
    </div>

    <div className="excel-ribbon-tabs" role="tablist" aria-label="Spreadsheet tools">
      {['Home', 'Insert', 'Data', 'View'].map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeRibbon === tab} className={activeRibbon === tab ? 'active' : ''} onClick={() => setActiveRibbon(tab)}>{tab}</button>)}
    </div>
    <div className="excel-ribbon" role="tabpanel">{renderRibbon()}</div>

    <div className="excel-formula-row">
      <form onSubmit={jumpToAddress}><input aria-label="Name box" className="excel-name-box" value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} /></form>
      <span className="excel-formula-icon">fx</span>
      <input aria-label="Formula bar" className="spreadsheet-formula-bar" value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} placeholder="Enter a value or formula" />
    </div>

    <div className="spreadsheet-hot">
      <SpreadsheetGrid data={gridData} columnCount={columnCount} fixedRowsTop={fixedRowsTop} hotRef={hotRef} onSelection={handleSelection} onGridChange={handleGridChange} />
    </div>

    <div className="excel-bottom-bar">
      <div className="spreadsheet-sheets">
        <button onClick={addSheet} className="excel-add-sheet" title="New worksheet" aria-label="New worksheet"><i className="icon-plus"></i></button>
        {sheets.map((sheet, index) => <div key={`${sheet.name}-${index}`} className="spreadsheet-sheet-tab-wrap">
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
        <span className="excel-zoom">100%</span>
      </div>
    </div>
    {sheetMenuOverlay}
  </div>
}
