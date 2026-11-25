export function canonicalizePanelBundle(source: string): string {
  const platformOutput =
    'new RegExp("^[ \t]+|(?<![ \t])[ \t]+$","g")';
  const canonicalOutput =
    'new RegExp("^[ \\t]+|(?<![ \\t])[ \t]+$","g")';
  const platformCount = source.split(platformOutput).length - 1;
  const canonicalCount = source.split(canonicalOutput).length - 1;

  if (platformCount === 1 && canonicalCount === 0) {
    return source.replace(platformOutput, canonicalOutput);
  }
  if (platformCount === 0 && canonicalCount === 1) return source;
  throw new Error("Unexpected panel bundle whitespace-regex output");
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path) throw new Error("Expected panel bundle path");
  const source = await Bun.file(path).text();
  await Bun.write(path, canonicalizePanelBundle(source));
}
