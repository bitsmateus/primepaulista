import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as front from "@/lib/planning";
import * as server from "../../server/src/lib/planningRules";
import {
  currentWeekStart, dayMonth, fromLocalInput, groupByWeekday, onlyMine, reminderLabel, shiftWeek, toLocalInput,
  weekDates, weekRangeLabel, weekSummary, type PlanningTask,
} from "@/lib/planningView";

// As regras puras existem em duas cópias (front e servidor): os MESMOS casos rodam nas duas.
const impls: [string, typeof front][] = [["front", front], ["servidor", server as unknown as typeof front]];

describe("cópias do front e do servidor", () => {
  it("o código das duas cópias é idêntico (fora o comentário do topo)", () => {
    const strip = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8").replace(/\r\n/g, "\n").replace(/^(\/\/.*\n)+/, "").trim();
    expect(strip("../lib/planning.ts")).toBe(strip("../../server/src/lib/planningRules.ts"));
  });
});

describe.each(impls)("planejamento: semanas e mensagem (%s)", (_name, m) => {
  it("weekStartOf devolve a segunda-feira", () => {
    expect(m.weekStartOf("2026-09-21")).toBe("2026-09-21"); // segunda
    expect(m.weekStartOf("2026-09-23")).toBe("2026-09-21"); // quarta
    expect(m.weekStartOf("2026-09-27")).toBe("2026-09-21"); // domingo pertence à semana que começou na segunda
    expect(m.weekStartOf("2026-09-28")).toBe("2026-09-28");
  });
  it("virada de mês e de ano", () => {
    expect(m.weekStartOf("2026-10-01")).toBe("2026-09-28"); // quinta
    expect(m.weekStartOf("2026-01-01")).toBe("2025-12-29"); // quinta, semana começou no ano anterior
    expect(m.addDays("2025-12-29", 6)).toBe("2026-01-04");
    expect(m.addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(m.addDays("2024-02-28", 1)).toBe("2024-02-29"); // bissexto
    expect(m.dateOfWeekday("2026-09-28", 3)).toBe("2026-10-01");
  });
  it("isMonday", () => {
    expect(m.isMonday("2026-09-21")).toBe(true);
    expect(m.isMonday("2026-09-22")).toBe(false);
    expect(m.isMonday("2026-02-30")).toBe(false); // data que não existe
    expect(m.isMonday("abc")).toBe(false);
  });
  it("datas inválidas lançam erro", () => {
    expect(() => m.weekStartOf("2026-13-01")).toThrow();
    expect(() => m.addDays("x", 1)).toThrow();
  });
  it("dayLabel", () => {
    expect(m.dayLabel("2026-09-21", 0)).toBe("segunda-feira (21/09)");
    expect(m.dayLabel("2026-09-21", 6)).toBe("domingo (27/09)");
    expect(m.dayLabel("2025-12-29", 3)).toBe("quinta-feira (01/01)");
  });
  it("firstName", () => {
    expect(m.firstName("  Maria  da Silva ")).toBe("Maria");
    expect(m.firstName("")).toBe("");
  });
  const vars = { assigneeName: "João Pedro", title: "Conferir vitrine", weekStart: "2026-09-21", weekday: 2, storeName: "Prime Teste" };
  it("renderReminder troca {nome} {tarefa} {dia} {loja}", () => {
    expect(m.renderReminder("Oi {nome}, {tarefa} ({dia}) - {loja}", vars)).toBe("Oi João, Conferir vitrine (quarta-feira (23/09)) - Prime Teste");
  });
  it("repete variáveis e mantém desconhecidas", () => {
    expect(m.renderReminder("{nome} {nome} {foo}", vars)).toBe("João João {foo}");
  });
  it("modelo vazio usa o padrão; nome vazio vira colaborador", () => {
    const t = m.renderReminder("   ", vars);
    expect(t).toBe("Olá, João! Lembrete da Prime Teste: você tem uma tarefa para quarta-feira (23/09): Conferir vitrine");
    expect(m.renderReminder("{nome}", { ...vars, assigneeName: "" })).toBe("colaborador");
  });
  it("$ no título não vira padrão de substituição", () => {
    expect(m.renderReminder("{tarefa}", { ...vars, title: "Pagar $& e $1" })).toBe("Pagar $& e $1");
  });
});

const task = (over: Partial<PlanningTask> = {}): PlanningTask => ({
  id: "1", weekStart: "2026-09-21", weekday: 0, title: "t", description: "", assigneeId: null, assigneeName: "", done: false, doneAt: null,
  remindAt: null, remindedAt: null, reminderMessage: "", whatsappStatus: null, whatsappError: null, whatsappAt: null, createdByName: "", createdAt: new Date(), ...over,
});

describe("planejamento: regras da tela", () => {
  it("currentWeekStart usa a data local e devolve segunda", () => {
    expect(currentWeekStart(new Date(2026, 8, 23, 10, 0))).toBe("2026-09-21"); // quarta 23/09
    expect(currentWeekStart(new Date(2026, 8, 27, 23, 59))).toBe("2026-09-21"); // domingo à noite
    expect(currentWeekStart(new Date(2026, 8, 28, 0, 0))).toBe("2026-09-28"); // segunda 00:00
    expect(currentWeekStart(new Date(2027, 0, 1))).toBe("2026-12-28"); // virada de ano
  });
  it("shiftWeek e weekDates", () => {
    expect(shiftWeek("2026-09-21", 1)).toBe("2026-09-28");
    expect(shiftWeek("2026-09-21", -1)).toBe("2026-09-14");
    expect(shiftWeek("2025-12-29", 1)).toBe("2026-01-05");
    expect(weekDates("2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weekDates("2025-12-29")[3]).toBe("2026-01-01");
  });
  it("weekRangeLabel (com virada de ano e de mês)", () => {
    expect(weekRangeLabel("2026-09-21")).toBe("21/09 a 27/09/2026");
    expect(weekRangeLabel("2026-09-28")).toBe("28/09 a 04/10/2026");
    expect(weekRangeLabel("2025-12-29")).toBe("29/12/2025 a 04/01/2026");
    expect(dayMonth("2026-09-05")).toBe("05/09");
  });
  it("weekSummary", () => {
    expect(weekSummary([])).toEqual({ total: 0, done: 0, percent: 0 });
    expect(weekSummary([task({ done: true }), task(), task({ done: true })])).toEqual({ total: 3, done: 2, percent: 67 });
  });
  it("groupByWeekday mantém a ordem e ignora dia inválido", () => {
    const g = groupByWeekday([task({ id: "a", weekday: 2 }), task({ id: "b", weekday: 0 }), task({ id: "c", weekday: 2 }), task({ id: "x", weekday: 9 })]);
    expect(g).toHaveLength(7);
    expect(g[2].map((t) => t.id)).toEqual(["a", "c"]);
    expect(g[0].map((t) => t.id)).toEqual(["b"]);
    expect(g.flat().some((t) => t.id === "x")).toBe(false);
  });
  it("onlyMine", () => {
    const l = [task({ id: "a", assigneeId: "u1" }), task({ id: "b", assigneeId: "u2" }), task({ id: "c", assigneeId: null })];
    expect(onlyMine(l, "u1").map((t) => t.id)).toEqual(["a"]);
    expect(onlyMine(l, undefined)).toEqual([]);
  });
  it("datetime-local ida e volta", () => {
    const d = new Date(2026, 8, 23, 14, 5);
    expect(toLocalInput(d)).toBe("2026-09-23T14:05");
    expect(toLocalInput(null)).toBe("");
    expect(new Date(fromLocalInput("2026-09-23T14:05")!).getTime()).toBe(d.getTime());
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("lixo")).toBeNull();
  });
  it("reminderLabel", () => {
    const now = new Date(2026, 8, 23, 12, 0);
    expect(reminderLabel(task())).toBeNull();
    expect(reminderLabel(task({ remindAt: new Date(2026, 8, 23, 15, 30) }), now)).toBe("Lembrete em 23/09 15:30");
    expect(reminderLabel(task({ remindAt: new Date(2026, 8, 23, 9, 0), whatsappStatus: "sent" }), now)).toBe("Lembrado por WhatsApp (23/09 09:00)");
    expect(reminderLabel(task({ remindAt: new Date(2026, 8, 23, 9, 0), whatsappStatus: "no_phone" }), now)).toBe("Sem WhatsApp cadastrado");
    expect(reminderLabel(task({ remindAt: new Date(2026, 8, 23, 9, 0), whatsappStatus: "failed" }), now)).toBe("WhatsApp falhou");
    expect(reminderLabel(task({ remindAt: new Date(2026, 8, 23, 9, 0) }), now)).toBe("Lembrete de 23/09 09:00");
  });
});
