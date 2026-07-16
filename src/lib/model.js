// Helpers for reading a thesis's saved financial model. The model is produced by
// the editor's SpreadsheetEditor as { filename, sheets: [{ name, model }] };
// older drafts may hold a bare { headers, rows } model.

// Normalise both shapes into a list of { name, model } sheets.
export const modelSheets = (model) => {
  if (!model) return []
  if (Array.isArray(model.sheets)) return model.sheets.filter((s) => s?.model?.rows)
  if (Array.isArray(model.rows)) return [{ name: 'Sheet1', model }]
  return []
}

// True when any cell in any sheet holds a value — an empty model isn't worth
// rendering a section for.
export const modelHasContent = (model) =>
  modelSheets(model).some((sheet) =>
    sheet.model.rows.some((row) =>
      String(row.label ?? '').trim() || row.values.some((value) => String(value ?? '').trim())
    )
  )
