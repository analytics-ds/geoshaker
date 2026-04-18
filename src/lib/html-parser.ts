export function getAttr(tag: string, attrName: string): string | undefined {
  // HTML5 : les valeurs non quotees excluent espace, ", ', =, <, >, backtick
  const re = new RegExp(
    `\\s${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    "i"
  );
  const m = tag.match(re);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3];
}

export function hasAttrEquals(tag: string, attrName: string, value: string): boolean {
  const v = getAttr(tag, attrName);
  return typeof v === "string" && v.toLowerCase() === value.toLowerCase();
}

export function extractTags(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return html.match(re) ?? [];
}

export function extractBlocks(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
