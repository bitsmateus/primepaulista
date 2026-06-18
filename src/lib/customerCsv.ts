import { LeadOrigin } from "@/types/inventory";
import { onlyDigits } from "@/lib/customers";

export interface CustomerImportInput {
  name: string;
  cpf: string;
  whatsapp: string;
  birthday: string;
  leadOrigin?: LeadOrigin;
}

export interface ParsedCustomersCsv {
  customers: CustomerImportInput[];
  errors: string[];
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

type Field = keyof CustomerImportInput;

function headerField(h: string): Field | null {
  const n = norm(h);
  if (n === "nome" || n === "cliente") return "name";
  if (n === "cpf") return "cpf";
  if (n.includes("whatsapp") || n.includes("telefone") || n.includes("celular") || n === "fone") return "whatsapp";
  if (n.includes("aniversario") || n.includes("nascimento") || n === "birthday" || n === "data") return "birthday";
  if (n.includes("origem") || n === "leadorigin") return "leadOrigin";
  return null;
}

function normalizeOrigin(raw: string): LeadOrigin | undefined {
  const n = norm(raw);
  if (n.includes("instagram") || n === "insta") return "Instagram";
  if (n.includes("indica")) return "Indicação";
  if (n.includes("trafego") || n.includes("pago") || n.includes("ads")) return "Tráfego Pago";
  return undefined;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCustomersCsv(text: string): ParsedCustomersCsv {
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { customers: [], errors: ["Arquivo vazio ou sem dados (precisa de cabeçalho + linhas)."] };
  }
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitLine(lines[0], sep).map(headerField);
  if (!headers.includes("name")) {
    return { customers: [], errors: ['Cabeçalho deve conter a coluna "Nome".'] };
  }

  const customers: CustomerImportInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep);
    const rec: Partial<Record<Field, string>> = {};
    headers.forEach((f, idx) => { if (f) rec[f] = cells[idx] ?? ""; });

    const name = (rec.name ?? "").trim();
    if (!name) {
      errors.push(`Linha ${i + 1}: nome vazio (ignorada).`);
      continue;
    }
    customers.push({
      name,
      cpf: (rec.cpf ?? "").trim(),
      whatsapp: (rec.whatsapp ?? "").trim(),
      birthday: (rec.birthday ?? "").trim(),
      leadOrigin: normalizeOrigin(rec.leadOrigin ?? ""),
    });
  }
  return { customers, errors };
}

export interface DedupResult {
  toCreate: CustomerImportInput[];
  ignored: CustomerImportInput[];
}

// Deduplica por CPF ou WhatsApp (contra os existentes E dentro do próprio lote).
export function dedupeCustomers(
  incoming: CustomerImportInput[],
  existing: { cpf: string; whatsapp: string }[]
): DedupResult {
  const cpfs = new Set(existing.map((c) => onlyDigits(c.cpf)).filter(Boolean));
  const phones = new Set(existing.map((c) => onlyDigits(c.whatsapp)).filter(Boolean));
  const toCreate: CustomerImportInput[] = [];
  const ignored: CustomerImportInput[] = [];

  for (const c of incoming) {
    const cpf = onlyDigits(c.cpf);
    const phone = onlyDigits(c.whatsapp);
    const dup = (cpf && cpfs.has(cpf)) || (phone && phones.has(phone));
    if (dup) {
      ignored.push(c);
      continue;
    }
    if (cpf) cpfs.add(cpf);
    if (phone) phones.add(phone);
    toCreate.push(c);
  }
  return { toCreate, ignored };
}
