'use client'

import { useMemo, useState } from 'react'
import { HotTable } from '@handsontable/react-wrapper'
import { HyperFormula } from 'hyperformula'
import { registerAllModules } from 'handsontable/registry'
import * as XLSX from 'xlsx'
import { modelSheets } from '../lib/model.js'
import 'handsontable/styles/handsontable.min.css'
import 'handsontable/styles/ht-theme-main.min.css'

registerAllModules()

// A read-only render of the financial model sealed with a published thesis. It
// mirrors the editor's grid (formulas still evaluate) but strips every editing
// affordance — the model is locked once the thesis is published, like the entry
// price. Kept separate from SpreadsheetEditor so the heavy ribbon/state code
// doesn't load on the thesis page.
const FORMULAS_CONFIG = { engine: HyperFormula, sheetName: 'Model' }
const DEFAULT_FILE_NAME = 'model.xlsx'

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

const toGrid = (model) => model.rows.map((row) => [row.label, ...row.values])

export default function SpreadsheetViewer({ model }) {
  const sheets = useMemo(() => modelSheets(model), [model])
  const [activeSheet, setActiveSheet] = useState(0)
  const fileName = model?.filename || DEFAULT_FILE_NAME

  const active = sheets[activeSheet] || sheets[0]
  const gridData = useMemo(() => (active ? toGrid(active.model) : []), [active])
  const columnCount = active ? Math.max(active.model.headers.length + 1, 1) : 1
  const height = Math.min(520, 30 + gridData.length * 23)

  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new()
    sheets.forEach(({ name, model: sheetModel }) => {
      const sheet = XLSX.utils.aoa_to_sheet(toGrid(sheetModel))
      sheetModel.rows.forEach((row, rowIndex) => [row.label, ...row.values].forEach((value, colIndex) => {
        if (String(value).startsWith('=')) sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })] = { t: 'n', f: String(value).slice(1) }
      }))
      XLSX.utils.book_append_sheet(workbook, sheet, name)
    })
    const exportName = String(fileName).trim() || DEFAULT_FILE_NAME
    XLSX.writeFile(workbook, /\.xlsx$/i.test(exportName) ? exportName : `${exportName}.xlsx`)
  }

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

    <div className="spreadsheet-hot">
      <HotTable
        data={gridData}
        colHeaders={(index) => columnLabel(index)}
        rowHeaders
        width="100%"
        height={height}
        colWidths={104}
        rowHeights={23}
        rowHeaderWidth={46}
        stretchH="none"
        readOnly
        disableVisualSelection={false}
        columnSorting
        autoWrapRow
        autoWrapCol
        minCols={columnCount}
        formulas={FORMULAS_CONFIG}
        licenseKey="non-commercial-and-evaluation"
        className="ht-theme-main spreadsheet-grid-theme"
      />
    </div>

    {sheets.length > 1 && (
      <div className="excel-bottom-bar">
        <div className="spreadsheet-sheets">
          {sheets.map((sheet, index) => <div key={`${sheet.name}-${index}`} className="spreadsheet-sheet-tab-wrap">
            <button
              onClick={() => setActiveSheet(index)}
              className={`spreadsheet-sheet-tab ${index === activeSheet ? 'active' : ''}`}
              aria-current={index === activeSheet ? 'page' : undefined}
            >{sheet.name}</button>
          </div>)}
        </div>
      </div>
    )}
  </div>
}
