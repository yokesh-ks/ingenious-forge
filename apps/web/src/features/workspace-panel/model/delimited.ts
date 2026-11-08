/** CSV and TSV as literal text, for the read-only grid. */

const MAX_CELLS = 200_000;

export interface Delimited {
  rows: string[][];
  columns: number;
  truncated: boolean;
}

/** Splits on `separator`, honouring double-quoted fields and `""` escapes. */
export function parseDelimited(text: string, separator: string): Delimited {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let cells = 0;
  let columns = 1;

  const endField = () => {
    row.push(field);
    field = "";
    cells += 1;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    columns = Math.max(columns, row.length);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    if (cells >= MAX_CELLS) return { rows, columns, truncated: true };
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === separator) endField();
    else if (char === "\n") endRow();
    else if (char === "\r") {
      if (input[i + 1] === "\n") i += 1;
      endRow();
    } else field += char;
  }
  if (field !== "" || row.length > 0) endRow();
  return { rows, columns, truncated: false };
}

/** A, B … Z, AA, AB, as a sheet numbers its columns. */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}
