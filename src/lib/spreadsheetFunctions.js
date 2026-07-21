import { HyperFormula } from 'hyperformula'

// Friendly copy for the functions analysts reach for most. Every other
// HyperFormula function is still exposed and searchable with a category-aware
// fallback description, so the picker reflects the actual calculation engine
// instead of a hand-maintained subset.
const DESCRIPTIONS = {
  ABS: 'Absolute value of a number',
  AND: 'TRUE when every condition is true',
  AVERAGE: 'Arithmetic mean of a range',
  AVERAGEIF: 'Average cells that meet one condition',
  CHOOSE: 'Pick a value from a list by index',
  CONCATENATE: 'Join text values into one string',
  COUNT: 'Count cells containing numbers',
  COUNTA: 'Count non-empty cells',
  COUNTIF: 'Count cells that meet one condition',
  COUNTIFS: 'Count cells that meet multiple conditions',
  DATE: 'Create an Excel date from year, month, and day',
  EDATE: 'Shift a date by a number of months',
  EOMONTH: 'Return the final day of a shifted month',
  FILTER: 'Return rows or columns that meet supplied conditions',
  FV: 'Future value of an investment',
  HLOOKUP: 'Look up a value across the first row of a range',
  IF: 'Return one value when a test is true and another when false',
  IFERROR: 'Return a fallback value when a formula errors',
  IFS: 'Evaluate multiple conditions in order',
  INDEX: 'Return the value at a row and column in a range',
  IPMT: 'Interest payment for a given investment period',
  IRR: 'Internal rate of return for periodic cash flows',
  LEFT: 'Return the leftmost characters of text',
  MATCH: 'Return the position of a value within a range',
  MAX: 'Largest value in a range',
  MAXIFS: 'Largest value meeting multiple conditions',
  MEDIAN: 'Middle value in a set of numbers',
  MIN: 'Smallest value in a range',
  MINIFS: 'Smallest value meeting multiple conditions',
  MIRR: 'Modified internal rate of return',
  NPER: 'Number of periods for a loan or investment',
  NPV: 'Net present value of periodic cash flows',
  OR: 'TRUE when any condition is true',
  PMT: 'Periodic payment for a loan or annuity',
  PPMT: 'Principal payment for a given investment period',
  PV: 'Present value of an investment',
  RATE: 'Interest rate per period of an annuity',
  RIGHT: 'Return the rightmost characters of text',
  ROUND: 'Round a number to a specified number of digits',
  SEQUENCE: 'Return an array of sequential numbers',
  SLN: 'Straight-line depreciation for one period',
  SQRT: 'Positive square root of a number',
  SUM: 'Add numbers or ranges',
  SUMIF: 'Add cells that meet one condition',
  SUMIFS: 'Add cells that meet multiple conditions',
  SUMPRODUCT: 'Sum products of corresponding array values',
  SWITCH: 'Match an expression against a list of values',
  TRANSPOSE: 'Rotate a range between rows and columns',
  VLOOKUP: 'Look up a value down the first column of a range',
  XLOOKUP: 'Look up a value and return the corresponding result',
  XNPV: 'Net present value of cash flows on irregular dates',
  YEARFRAC: 'Fraction of a year between two dates',
}

const CATEGORY_RULES = [
  ['Financial', /Financial/],
  ['Lookup & reference', /Lookup|Address|Hyperlink|FormulaText/],
  ['Date & time', /DateTime/],
  ['Logical', /Boolean/],
  ['Text', /Text|Char|Code|Roman/],
  ['Statistical', /Statistical|Median|Percentile|Count|ConditionalAggregation/],
  ['Math & trigonometry', /Math|Abs|Exp|Logarithm|Modulo|Power|Rounding|Sqrt|Sumprod|Trigonometry|Degrees|Radians|Random/],
  ['Engineering', /Complex|Bit|Radix|Delta/],
  ['Array', /Array|Matrix|Sequence/],
  ['Database', /Database/],
  ['Information', /Information|IsEven|IsOdd/],
]

const categoryFor = (name) => {
  const pluginName = HyperFormula.getFunctionPlugin(name)?.name || ''
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(pluginName))?.[0] || 'Other'
}

const CATEGORY_ORDER = [
  'Financial',
  'Lookup & reference',
  'Logical',
  'Statistical',
  'Math & trigonometry',
  'Date & time',
  'Text',
  'Array',
  'Information',
  'Engineering',
  'Database',
  'Other',
]

const names = HyperFormula.getRegisteredFunctionNames('enGB')
  .filter((name) => !name.startsWith('HF.') && name !== 'VERSION')
  .sort((left, right) => left.localeCompare(right))

export const FUNCTION_LIBRARY = CATEGORY_ORDER
  .map((category) => ({
    category,
    items: names
      .filter((name) => categoryFor(name) === category)
      .map((name) => ({
        name,
        syntax: `${name}(…)`,
        desc: DESCRIPTIONS[name] || `${category} function`,
      })),
  }))
  .filter((group) => group.items.length)

export const FUNCTION_INDEX = new Map(
  FUNCTION_LIBRARY.flatMap((group) =>
    group.items.map((item) => [item.name, { ...item, category: group.category }]),
  ),
)

export const FUNCTION_NAMES = [...FUNCTION_INDEX.keys()]

