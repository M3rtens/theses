import { columnIndexFromLabel, columnLabel } from './spreadsheet.js'
import { createWorkbookFormulaEngine } from './spreadsheetEngine.js'

export const CHART_TYPES = ['line', 'bar', 'area']

export function parseChartRange(value) {
  const match = String(value || '').trim().toUpperCase().match(/^([A-Z]{1,3})([1-9]\d*):([A-Z]{1,3})([1-9]\d*)$/)
  if (!match) return null
  const firstCol = columnIndexFromLabel(match[1])
  const firstRow = Number(match[2]) - 1
  const secondCol = columnIndexFromLabel(match[3])
  const secondRow = Number(match[4]) - 1
  if ([firstCol, firstRow, secondCol, secondRow].some((number) => !Number.isSafeInteger(number) || number < 0)) return null
  const range = {
    top: Math.min(firstRow, secondRow),
    bottom: Math.max(firstRow, secondRow),
    left: Math.min(firstCol, secondCol),
    right: Math.max(firstCol, secondCol),
  }
  if (range.bottom - range.top + 1 > 50 || range.right - range.left + 1 > 50) return null
  return range
}

export function normalizeChartRange(value) {
  const range = parseChartRange(value)
  if (!range) return null
  return `${columnLabel(range.left)}${range.top + 1}:${columnLabel(range.right)}${range.bottom + 1}`
}

const sheetsOf = (model) => {
  if (Array.isArray(model?.sheets)) return model.sheets
  return model?.rows ? [{ name: 'Sheet1', model }] : []
}

const rawCell = (sheet, row, col) => {
  const source = sheet?.model?.rows?.[row]
  return col === 0 ? source?.label : source?.values?.[col - 1]
}

const numericValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  let text = value.trim()
  if (!text || text.startsWith('=')) return null
  const negative = /^\(.*\)$/.test(text)
  text = text.replace(/[,$€£¥\s]/g, '').replace(/^\((.*)\)$/, '$1')
  const percent = text.endsWith('%')
  if (percent) text = text.slice(0, -1)
  const number = Number(text)
  if (!Number.isFinite(number)) return null
  return (negative ? -number : number) / (percent ? 100 : 1)
}

const displayLabel = (value, fallback) => {
  const label = String(value ?? '').trim()
  return label && !label.startsWith('=') ? label : fallback
}

export function buildModelChartData(model, chart) {
  const range = parseChartRange(chart?.range)
  const sheets = sheetsOf(model)
  const sheet = sheets.find((item) => item.name === chart?.sheet)
  if (!range || !sheet) return { error: 'Choose a valid sheet and cell range.' }

  const firstDataRow = range.top + (chart.firstRowLabels !== false ? 1 : 0)
  const firstDataCol = range.left + (chart.firstColumnSeries !== false ? 1 : 0)
  if (firstDataRow > range.bottom || firstDataCol > range.right) {
    return { error: 'The selected range does not contain chart values.' }
  }

  let engine
  try {
    engine = createWorkbookFormulaEngine(sheets)
    const sheetId = engine.getSheetId(sheet.name)
    const valueAt = (row, col) => {
      const calculated = engine.getCellValue({ sheet: sheetId, row, col })
      return numericValue(calculated) ?? numericValue(rawCell(sheet, row, col))
    }
    const categories = []
    for (let col = firstDataCol; col <= range.right; col++) {
      categories.push(chart.firstRowLabels !== false
        ? displayLabel(rawCell(sheet, range.top, col), columnLabel(col))
        : columnLabel(col))
    }

    const series = []
    for (let row = firstDataRow; row <= range.bottom; row++) {
      const values = []
      for (let col = firstDataCol; col <= range.right; col++) values.push(valueAt(row, col))
      if (values.some((value) => value != null)) {
        series.push({
          name: chart.firstColumnSeries !== false
            ? displayLabel(rawCell(sheet, row, range.left), `Series ${series.length + 1}`)
            : `Series ${series.length + 1}`,
          values,
        })
      }
    }
    if (!series.length) return { error: 'The selected range has no numeric values.' }
    return { categories, series: series.slice(0, 8) }
  } catch {
    return { error: 'The workbook range could not be calculated.' }
  } finally {
    engine?.destroy()
  }
}

export function createChartDefinition(overrides = {}) {
  return {
    id: overrides.id || `chart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: overrides.title || 'Model chart',
    type: CHART_TYPES.includes(overrides.type) ? overrides.type : 'line',
    sheet: overrides.sheet || '',
    range: overrides.range || 'A1:E3',
    firstRowLabels: overrides.firstRowLabels !== false,
    firstColumnSeries: overrides.firstColumnSeries !== false,
    yAxisLabel: overrides.yAxisLabel || '',
    showLegend: overrides.showLegend !== false,
  }
}
