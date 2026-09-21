import { Device } from "@/types/inventory";

export type DeviceImportInput = Omit<Device, "id" | "createdAt" | "checkedAt">;

export interface ParsedDeviceCsv {
  devices: DeviceImportInput[];
  // Número da linha no arquivo (cabeçalho = 1) de cada aparelho de `devices`
  rowNumbers: number[];
  errors: string[];
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[º°]/g, "").trim();

type Field = keyof DeviceImportInput;

// Mapeia o cabeçalho normalizado → campo do aparelho
function headerField(h: string): Field | null {
  const n = norm(h);
  if (n === "categoria") return "category";
  if (n === "marca") return "brand";
  if (n === "local" || n === "localizacao" || n === "localizacao do estoque") return "location";
  if (n === "modelo") return "model";
  if (n === "capacidade" || n === "capac." || n === "capac") return "capacity";
  if (n === "cor") return "color";
  if (n === "condicao") return "condition";
  if (n.startsWith("bateria") || n.startsWith("saude")) return "batteryHealth";
  if (n === "fornecedor") return "supplier";
  if (n === "custo" || n.startsWith("preco de compra") || n.startsWith("preco compra")) return "cost";
  if (n.startsWith("preco")) return "salePrice";
  if (n === "data de entrada" || n === "entrada" || n === "data entrada") return "entryDate";
  if (n === "observacoes" || n === "observacao" || n === "obs") return "notes";
  if (/^imei\s*2$/.test(n)) return "imei2";
  if (/^imei\s*1$/.test(n) || n === "imei") return "serialImei";
  if (n === "serial" || n === "numero de serie" || n === "n de serie" || n === "no de serie") return "serial";
  // Cabeçalho antigo "Serial/IMEI": vale como IMEI 1
  if (n.includes("serial") || n.includes("imei")) return "serialImei";
  return null;
}

// Converte número aceitando formatos pt-BR ("5.000,00" / "5000,00") e en ("5000.00")
function parseNum(raw: string): number {
  let s = (raw || "").trim().replace(/[R$%\s]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "5.000" = cinco mil
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Aceita dd/mm/aaaa, aaaa-mm-dd ou um Date (célula de data do Excel)
function parseDate(raw: string): Date | undefined {
  const s = (raw || "").trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]), 12);
    return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? undefined : d;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

// Divide uma linha CSV respeitando aspas
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

// Detecta o separador pelo cabeçalho: tabulação (colado do Excel/Sheets), ; ou ,
function detectSeparator(headerLine: string): string {
  const count = (ch: string) => (headerLine.match(new RegExp(ch === "\t" ? "\t" : `\\${ch}`, "g")) ?? []).length;
  const candidates: [string, number][] = [["\t", count("\t")], [";", count(";")], [",", count(",")]];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ";";
}

// Célula do Excel (texto, número, data…) → texto. Números inteiros grandes
// (IMEI) não podem virar notação científica.
export function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(v.getDate())}/${p(v.getMonth() + 1)}/${v.getFullYear()}`;
  }
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).trim();
}

// Linhas já separadas em células (CSV ou Excel); a 1ª linha é o cabeçalho.
export function parseDeviceRows(rows: string[][]): ParsedDeviceCsv {
  const nonEmpty = rows
    .map((cells, i) => ({ cells, rowNumber: i + 1 }))
    .filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (nonEmpty.length < 2) {
    return {
      devices: [], rowNumbers: [],
      errors: ["Arquivo vazio ou sem dados (precisa de cabeçalho + linhas)."],
    };
  }
  const headers = nonEmpty[0].cells.map(headerField);
  if (!headers.includes("model")) {
    return { devices: [], rowNumbers: [], errors: ['Cabeçalho deve conter a coluna "Modelo".'] };
  }

  const errors: string[] = [];
  const devices: DeviceImportInput[] = [];
  const rowNumbers: number[] = [];
  for (const { cells, rowNumber } of nonEmpty.slice(1)) {
    const rec: Record<string, string> = {};
    headers.forEach((f, idx) => { if (f) rec[f] = cells[idx] ?? ""; });

    if (!rec.model?.trim()) {
      errors.push(`Linha ${rowNumber}: modelo vazio (ignorada).`);
      continue;
    }
    const cond = norm(rec.condition || "");
    // Remove espaços internos (comuns em serial/IMEI colado do Excel, ex.: "D V 6 F F 5")
    const id = (v?: string) => (v ?? "").replace(/\s+/g, "").trim();
    devices.push({
      category: rec.category?.trim() || "iPhone",
      brand: rec.brand?.trim() || "Apple",
      location: rec.location?.trim() || "Estoque",
      model: rec.model.trim(),
      capacity: rec.capacity?.trim() || "",
      color: rec.color?.trim() || "",
      condition: cond.includes("semin") || cond.includes("usado") ? "Seminovo" : "Lacrado",
      batteryHealth: rec.batteryHealth ? Math.min(100, Math.max(0, Math.round(parseNum(rec.batteryHealth)))) : 100,
      supplier: rec.supplier?.trim() || "",
      cost: parseNum(rec.cost),
      salePrice: rec.salePrice && parseNum(rec.salePrice) > 0 ? parseNum(rec.salePrice) : undefined,
      serialImei: id(rec.serialImei),
      imei2: id(rec.imei2),
      serial: id(rec.serial),
      internalSerial: "",
      entryDate: parseDate(rec.entryDate),
      notes: rec.notes?.trim() || "",
      status: "Disponível",
    });
    rowNumbers.push(rowNumber);
  }
  return { devices, rowNumbers, errors };
}

export function parseDevicesCsv(text: string): ParsedDeviceCsv {
  // Mantém as linhas em branco para que o número da linha reportado seja o do arquivo
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines.find((l) => l.trim() !== "");
  if (first === undefined) {
    return {
      devices: [], rowNumbers: [],
      errors: ["Arquivo vazio ou sem dados (precisa de cabeçalho + linhas)."],
    };
  }
  const sep = detectSeparator(first);
  return parseDeviceRows(lines.map((l) => splitLine(l, sep)));
}

// Excel (.xlsx) já lido pela biblioteca: linhas de células de tipos variados
export function parseDevicesSheet(rows: unknown[][]): ParsedDeviceCsv {
  return parseDeviceRows(rows.map((r) => r.map(cellToString)));
}

// ---------------------------------------------------------------------------
// Validação antes de importar (prévia)
// ---------------------------------------------------------------------------

export interface ImportRowResult {
  rowNumber: number;
  device: DeviceImportInput;
  errors: string[];
  warnings: string[];
  valid: boolean;
}

const lc = (v?: string) => (v ?? "").replace(/\s+/g, "").toLowerCase();

// Confere cada linha contra o estoque ativo (não vendido) e contra o próprio arquivo.
// `ignoreExisting`: quando o estoque atual vai ser apagado antes, duplicidade com ele não conta.
export function validateImport(
  parsed: ParsedDeviceCsv,
  existing: Pick<Device, "status" | "serialImei" | "imei2" | "serial">[],
  opts: { ignoreExisting?: boolean } = {}
): ImportRowResult[] {
  const active = new Set<string>();
  if (!opts.ignoreExisting) {
    for (const d of existing) {
      if (d.status === "Vendido") continue;
      for (const v of [d.serialImei, d.imei2, d.serial]) if (v) active.add(lc(v));
    }
  }
  const seenInFile = new Set<string>();

  return parsed.devices.map((device, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!device.serialImei && !device.serial && !device.internalSerial) {
      warnings.push("Número de série ausente (será gerado um código interno)");
    }
    const checks: [string, string | undefined][] = [
      ["IMEI", device.serialImei],
      ["IMEI 2", device.imei2],
      ["Número de série", device.serial],
    ];
    for (const [label, value] of checks) {
      if (!value) continue;
      if (active.has(lc(value))) errors.push(`${label} já consta no estoque ativo`);
      else if (seenInFile.has(lc(value))) errors.push(`${label} repetido no arquivo`);
    }
    if (errors.length === 0) {
      for (const [, value] of checks) if (value) seenInFile.add(lc(value));
    }
    if (!device.cost) warnings.push("Custo não informado");

    return { rowNumber: parsed.rowNumbers[i], device, errors, warnings, valid: errors.length === 0 };
  });
}

// ---------------------------------------------------------------------------
// Modelo de planilha para download
// ---------------------------------------------------------------------------

export const DEVICE_TEMPLATE_HEADERS = [
  "Categoria", "Marca", "Modelo", "Capacidade", "Cor", "Condição", "Bateria",
  "IMEI 1", "IMEI 2", "Serial", "Fornecedor", "Custo", "Preço de venda",
  "Local", "Data de entrada", "Observações",
];
export const DEVICE_TEMPLATE_EXAMPLE = [
  "iPhone", "Apple", "iPhone 15 Pro", "256", "Titânio Natural", "Lacrado", "100",
  "359000000000000", "359000000000001", "F2LXXXXXXXXX", "Fornecedor X", "6000", "7500",
  "Vitrine 1", "01/06/2026", "",
];
