// Regras puras de fornecedores (nome, documento, casamento por nome).

export const normSupplierName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

// 11 dígitos -> CPF; 14 -> CNPJ; outro tamanho volta como veio
export function formatDocument(doc: string): string {
  const d = onlyDigits(doc);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return doc;
}

// CPF/CNPJ é opcional; se preenchido, precisa ter 11 ou 14 dígitos
export function isValidDocument(doc: string): boolean {
  const d = onlyDigits(doc);
  return d === "" || d.length === 11 || d.length === 14;
}

export function findSupplierByName<T extends { name: string }>(list: T[], name: string): T | undefined {
  const n = normSupplierName(name);
  if (!n) return undefined;
  return list.find((s) => normSupplierName(s.name) === n);
}

// Nomes de fornecedor de um arquivo que ainda não existem no cadastro (sem repetir)
export function newSupplierNames(names: string[], existing: { name: string }[]): string[] {
  const known = new Set(existing.map((s) => normSupplierName(s.name)));
  const out: string[] = [];
  for (const raw of names) {
    const n = normSupplierName(raw);
    if (!n || known.has(n)) continue;
    known.add(n);
    out.push(raw.trim().replace(/\s+/g, " "));
  }
  return out;
}
