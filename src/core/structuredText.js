const tableLikeLanguages = new Set([
  "",
  "text",
  "txt",
  "plaintext",
  "console",
  "bash",
  "sh",
  "shell",
  "shellsession",
  "zsh",
  "powershell",
  "pwsh",
]);

function trimOuterBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

function machineCell(cell) {
  return (
    /^[0-9a-f]{7,}$/i.test(cell) ||
    /^[A-Z][A-Z0-9_-]*$/.test(cell) ||
    /^\d+(?:\.\d+)*$/.test(cell) ||
    /(?:refs\/|[/\\][^\s]+|^[a-z]+:\/\/)/i.test(cell)
  );
}

export function parsePreformattedTable(value, language = "") {
  if (!tableLikeLanguages.has(String(language || "").trim().toLowerCase())) return null;

  const lines = trimOuterBlankLines(
    String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n"),
  ).filter((line) => line.trim());
  if (lines.length < 2 || lines.length > 30) return null;

  const usesTabs = lines.every((line) => line.includes("\t"));
  const splitter = usesTabs ? /\t+/ : /\s{2,}/;
  const rows = lines.map((line) =>
    line
      .trim()
      .split(splitter)
      .map((cell) => cell.trim()),
  );
  const columnCount = rows[0]?.length || 0;
  if (columnCount < 2 || columnCount > 6) return null;
  if (rows.some((row) => row.length !== columnCount || row.some((cell) => !cell))) return null;

  if (!usesTabs) {
    const machineRows = rows.filter((row) => row.some(machineCell)).length;
    if (machineRows < Math.ceil(rows.length / 2)) return null;
  }

  return { rows, columnCount };
}
