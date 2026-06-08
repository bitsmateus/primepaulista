import { Device } from "@/types/inventory";

export type DeviceImportInput = Omit<Device, "id" | "createdAt">;

export interface ParsedDeviceCsv {
  devices: DeviceImportInput[];
  errors: string[];
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Mapeia o cabeçalho normalizado → campo do aparelho
function headerField(h: string): keyof DeviceImportInput | "salePrice" | null {
  const n = norm(h);
  if (n === "categoria") return "category";
  if (n === "modelo") return "model";
  if (n === "capacidade" || n === "capac." || n === "capac") return "capacity";
  if (n === "cor") return "color";
  if (n === "condicao") return "condition";
  if (n.startsWith("bateria")) return "batteryHealth";
  if (n === "fornecedor") return "supplier";
  if (n === "custo") return "cost";
  if (n.startsWith("preco")) return "salePrice";
  if (n.includes("serial") || n.includes("imei")) return "serialImei";
  return null;
}

// Converte número aceitando formatos pt-BR ("5.000,00" / "5000,00") e en ("5000.00")
function parseNum(raw: string): number {
  let s = (raw || "").trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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

export function parseDevicesCsv(text: string): ParsedDeviceCsv {
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { devices: [], errors: ["Arquivo vazio ou sem dados (precisa de cabeçalho + linhas)."] };
  }
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitLine(lines[0], sep).map(headerField);
  if (!headers.includes("model")) {
    return { devices: [], errors: ['Cabeçalho deve conter a coluna "Modelo".'] };
  }

  const devices: DeviceImportInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep);
    const rec: Record<string, string> = {};
    headers.forEach((f, idx) => { if (f) rec[f] = cells[idx] ?? ""; });

    if (!rec.model?.trim()) {
      errors.push(`Linha ${i + 1}: modelo vazio (ignorada).`);
      continue;
    }
    const cond = norm(rec.condition || "");
    devices.push({
      category: rec.category?.trim() || "iPhone",
      model: rec.model.trim(),
      capacity: rec.capacity?.trim() || "",
      color: rec.color?.trim() || "",
      condition: cond.includes("semin") ? "Seminovo" : "Lacrado",
      batteryHealth: rec.batteryHealth ? Math.min(100, Math.max(0, Math.round(parseNum(rec.batteryHealth)))) : 100,
      supplier: rec.supplier?.trim() || "",
      cost: parseNum(rec.cost),
      salePrice: rec.salePrice && parseNum(rec.salePrice) > 0 ? parseNum(rec.salePrice) : undefined,
      serialImei: rec.serialImei?.trim() || "",
      internalSerial: "",
      status: "Disponível",
    });
  }
  return { devices, errors };
}
