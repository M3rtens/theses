import { HyperFormula } from 'hyperformula'

// Handsontable can share one HyperFormula instance across worksheets. Keeping a
// single engine per workbook is what makes references such as `=Forecast!D12`
// recalculate correctly when another sheet changes.
const ENGINE_CONFIG = {
  licenseKey: 'gpl-v3',
}

export const gridFromSheetModel = (model) =>
  (model?.rows || []).map((row) => [row.label ?? '', ...(row.values || [])])

export const createWorkbookFormulaEngine = (sheets) => {
  const source = Object.fromEntries(
    (sheets || []).map((sheet) => [sheet.name, gridFromSheetModel(sheet.model)]),
  )
  return HyperFormula.buildFromSheets(source, ENGINE_CONFIG)
}

const preserveSheetLayout = (model, serialized) => {
  const source = Array.isArray(serialized) ? serialized : []
  const currentColumnCount = Math.max((model?.headers?.length || 0) + 1, 1)
  const sourceColumnCount = source.reduce((max, row) => Math.max(max, row?.length || 0), 0)
  const columnCount = Math.max(currentColumnCount, sourceColumnCount, 1)
  const rowCount = Math.max(model?.rows?.length || 0, source.length, 1)
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const row = source[rowIndex] || []
    return {
      label: String(row[0] ?? ''),
      values: Array.from({ length: columnCount - 1 }, (_, columnIndex) =>
        String(row[columnIndex + 1] ?? ''),
      ),
    }
  })

  return {
    ...model,
    headers: Array(columnCount - 1).fill(''),
    rows,
  }
}

// Rebuild the contents of a stable engine after a workbook-level operation
// (import, undo, delete sheet, replace-all). The instance itself stays stable so
// Handsontable doesn't lose its formula-plugin connection.
export const syncWorkbookFormulaEngine = (engine, sheets) => {
  if (!engine) return
  const desiredNames = new Set((sheets || []).map((sheet) => sheet.name))

  engine.batch(() => {
    for (const sheet of sheets || []) {
      if (!engine.doesSheetExist(sheet.name)) engine.addSheet(sheet.name)
    }

    for (const name of engine.getSheetNames()) {
      if (!desiredNames.has(name)) engine.removeSheet(engine.getSheetId(name))
    }

    for (const sheet of sheets || []) {
      engine.setSheetContent(engine.getSheetId(sheet.name), gridFromSheetModel(sheet.model))
    }
  })
}

// HyperFormula rewrites references when a sheet is renamed/deleted. Pull those
// rewritten formulas back into the persisted model so a later React render does
// not overwrite the corrected engine state with stale formula strings.
export const serializeWorkbookFormulaEngine = (engine, sheets) =>
  (sheets || []).map((sheet) => {
    if (!engine?.doesSheetExist(sheet.name)) return sheet
    const sheetId = engine.getSheetId(sheet.name)
    return {
      ...sheet,
      model: preserveSheetLayout(sheet.model, engine.getSheetSerialized(sheetId)),
    }
  })

export const renameFormulaSheet = (engine, oldName, newName, sheets) => {
  if (!engine?.doesSheetExist(oldName)) return sheets
  engine.renameSheet(engine.getSheetId(oldName), newName)
  return serializeWorkbookFormulaEngine(engine, sheets)
}

