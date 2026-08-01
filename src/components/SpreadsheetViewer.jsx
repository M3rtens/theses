'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { HotTable } from '@handsontable/react-wrapper'
import { registerAllModules } from 'handsontable/registry'
import { modelSheets } from '../lib/model.js'
import {
  applyCellStyle,
  buildCellsFn,
  buildColWidthsFn,
  buildRowHeightsFn,
  columnLabel,
  exportModelToXlsx,
  mergesFor,
} from '../lib/spreadsheet.js'
import { createWorkbookFormulaEngine } from '../lib/spreadsheetEngine.js'
import { normalizePublicUrl } from '../lib/urls.js'
import 'handsontable/styles/handsontable.min.css'
import 'handsontable/styles/ht-theme-main.min.css'

registerAllModules()

// A read-only render of the financial model sealed with a published thesis. It
// mirrors the editor's grid — formulas still evaluate and the saved formatting
// (bold, colours, number formats, merges, column widths) renders — but strips
// every editing affordance, since the model is locked once the thesis is
// published, like the entry price. Kept separate from SpreadsheetEditor so the
// heavy ribbon/state code doesn't load on the thesis page.
const DEFAULT_FILE_NAME = 'model.xlsx'

const toGrid = (model) => model.rows.map((row) => [row.label, ...row.values])

export default function SpreadsheetViewer({ model }) {
  const sheets = useMemo(() => modelSheets(model), [model])
  const [activeSheet, setActiveSheet] = useState(() => Math.max(0, sheets.findIndex((sheet) => !sheet.hidden)))
  const [formulaEngine] = useState(() => createWorkbookFormulaEngine(sheets))
  const formulaEngineDestroyTimer = useRef(null)
  const hotRef = useRef(null)
  const [selection, setSelection] = useState({ row: 0, col: 0, row2: 0, col2: 0 })
  const [zoom, setZoom] = useState(100)
  const fileName = model?.filename || DEFAULT_FILE_NAME

  const active = sheets[activeSheet] || sheets[0]
  const gridData = useMemo(() => (active ? toGrid(active.model) : []), [active])
  const cellsFn = useMemo(() => buildCellsFn(active?.model.formats, active?.model.comments), [active])
  const colWidthsFn = useMemo(() => buildColWidthsFn(active?.model.colWidths), [active])
  const rowHeightsFn = useMemo(() => buildRowHeightsFn(active?.model.rowHeights), [active])
  const mergesProp = useMemo(() => mergesFor(active?.model.merges), [active])
  const columnCount = active ? Math.max(active.model.headers.length + 1, 1) : 1
  const height = Math.min(520, 30 + gridData.length * 23)
  const view = active?.model?.view || {}
  const formulasConfig = useMemo(() => ({ engine: formulaEngine, sheetName: active?.name }), [active?.name, formulaEngine])
  const selectedValue = gridData[selection.row]?.[selection.col] ?? ''
  const selectedAddress = `${columnLabel(selection.col)}${selection.row + 1}`

  const exportWorkbook = () => exportModelToXlsx(sheets, fileName, DEFAULT_FILE_NAME)

  useEffect(() => {
    clearTimeout(formulaEngineDestroyTimer.current)
    return () => {
      formulaEngineDestroyTimer.current = setTimeout(() => formulaEngine.destroy(), 0)
    }
  }, [formulaEngine])

  if (!active) return null

  return <div className="excel-workbook-shell">
    <div className="excel-titlebar">
      <div className="excel-app-mark">X</div>
      <span className="spreadsheet-file-name" style={{ fontWeight: 600 }}>{fileName}</span>
      <div className="excel-title-actions">
        <span className="excel-saved-state">Sealed with thesis · read-only</span>
        <button type="button" className="primary" onClick={exportWorkbook}><i className="icon-download"></i><span>Download</span></button>
      </div>
    </div>

    <div className="excel-ribbon-tabs viewer" role="tablist" aria-label="Read-only spreadsheet tools">
      {['Home', 'Insert', 'Formulas', 'Data', 'Review', 'View'].map((tab, index) => <button key={tab} type="button" role="tab" aria-selected={index === 0} className={index === 0 ? 'active' : ''} disabled={index !== 0}>{tab}</button>)}
    </div>
    <div className="excel-ribbon excel-viewer-ribbon" aria-label="Read-only workbook ribbon">
      <div className="excel-viewer-ribbon-group"><i className="icon-lock"></i><span>Workbook is read-only</span></div>
      <div className="excel-viewer-ribbon-group"><span>Values, formulas, formatting, and worksheet layout are preserved.</span></div>
    </div>

    <div className="excel-formula-row">
      <input aria-label="Selected cell" className="excel-name-box" readOnly value={selectedAddress} />
      <span className="excel-formula-icon">fx</span>
      <input aria-label="Formula bar" className="spreadsheet-formula-bar" readOnly value={selectedValue} />
    </div>

    <div className="spreadsheet-hot" style={{ zoom: zoom / 100 }}>
      <HotTable
        ref={hotRef}
        data={gridData}
        colHeaders={view.showHeaders === false ? false : (index) => columnLabel(index)}
        rowHeaders={view.showHeaders !== false}
        width="100%"
        height={height}
        colWidths={colWidthsFn}
        rowHeights={rowHeightsFn}
        rowHeaderWidth={46}
        stretchH="none"
        readOnly
        comments
        disableVisualSelection={false}
        columnSorting
        autoWrapRow
        autoWrapCol
        minCols={columnCount}
        fixedRowsTop={view.fixedRowsTop || 0}
        fixedColumnsStart={view.fixedColumnsStart || 0}
        mergeCells={mergesProp}
        cells={cellsFn}
        formulas={formulasConfig}
        licenseKey="non-commercial-and-evaluation"
        className={`ht-theme-main spreadsheet-grid-theme ${view.showGridlines === false ? 'no-gridlines' : ''}`}
        afterSelectionEnd={(row, col, row2, col2) => setSelection({ row, col, row2, col2 })}
        afterOnCellMouseDown={(event, coords) => {
          if (event.detail !== 2 || coords.row < 0 || coords.col < 0) return
          const row = hotRef.current?.hotInstance?.toPhysicalRow(coords.row)
          const col = hotRef.current?.hotInstance?.toPhysicalColumn(coords.col)
          const link = row == null || col == null ? null : normalizePublicUrl(active.model.formats?.[`${row},${col}`]?.link)
          if (link) window.open(link, '_blank', 'noopener,noreferrer')
        }}
        afterRenderer={(td, row, col, prop, value, cellProperties) => applyCellStyle(td, cellProperties)}
      />
    </div>

      <div className="excel-bottom-bar">
        <div className="spreadsheet-sheets">
          {sheets.map((sheet, index) => sheet.hidden ? null : <div key={sheet.name} className="spreadsheet-sheet-tab-wrap">
            <button
              onClick={() => setActiveSheet(index)}
              className={`spreadsheet-sheet-tab ${index === activeSheet ? 'active' : ''}`}
              aria-current={index === activeSheet ? 'page' : undefined}
            >{sheet.name}</button>
          </div>)}
        </div>
        <div className="excel-status-bar">
          <span>Ready</span>
          <div className="excel-zoom">
            <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))}>−</button>
            <span className="excel-zoom-value">{zoom}%</span>
            <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(200, value + 10))}>+</button>
          </div>
        </div>
      </div>
  </div>
}
