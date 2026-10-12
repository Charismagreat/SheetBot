/**
 * Brace-balanced removal of a top-level `function name()` block in Apps Script source.
 */
export function removeGasFunctionDefinition(code: string, functionName: string): string {
  const re = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`, "g");
  const match = re.exec(code);
  if (!match) return code;

  const start = match.index;
  let i = match.index + match[0].length;
  let depth = 1;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }

  return (code.slice(0, start) + code.slice(i)).replace(/\n{3,}/g, "\n\n");
}
