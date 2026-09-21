import { Fragment, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, Loader2, RotateCcw, Search } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { api, AuditFilters } from "@/lib/api";
import { actionLabel, actionTone, entityLabel } from "@/lib/audit";
import { downloadBlob } from "@/lib/download";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE = 50;
const ALL = "__all__";

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Auditoria: somente leitura. Filtros, paginação e ordenação (mais recentes primeiro) ficam no servidor.
export default function AuditPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [entity, setEntity] = useState(ALL);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState<AuditFilters>({});
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: opts } = useQuery({ queryKey: ["auditFilters"], queryFn: api.auditFilters, staleTime: 30_000 });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["auditLogs", applied, offset],
    queryFn: () => api.listAuditLogs({ ...applied, limit: PAGE, offset }),
    placeholderData: keepPreviousData,
  });

  const buildFilters = (): AuditFilters => ({
    from: from || undefined,
    to: to || undefined,
    userId: userId !== ALL ? userId : undefined,
    action: action !== ALL ? action : undefined,
    entity: entity !== ALL ? entity : undefined,
    q: q.trim() || undefined,
  });
  const apply = () => {
    setApplied(buildFilters());
    setOffset(0);
    setOpen(null);
  };
  const clear = () => {
    setFrom(""); setTo(""); setUserId(ALL); setAction(ALL); setEntity(ALL); setQ("");
    setApplied({});
    setOffset(0);
    setOpen(null);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.exportAuditCsv(applied);
      downloadBlob(blob, "auditoria.csv");
      toast.success("Auditoria exportada.");
    } catch {
      toast.error("Não foi possível exportar a auditoria.");
    } finally {
      setExporting(false);
    }
  };

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + PAGE, total);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Auditoria</h1>
            <p className="mt-1 text-sm text-muted-foreground">Quem fez o quê e quando. Somente leitura.</p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar CSV
          </Button>
        </div>

        <Card className="border shadow-none">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="aud-from">De</Label>
              <Input id="aud-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="aud-to">Até</Label>
              <Input id="aud-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Usuário</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger aria-label="Filtrar por usuário"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {(opts?.users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name || "(sem nome)"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ação</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger aria-label="Filtrar por ação"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {(opts?.actions ?? []).map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Entidade</Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger aria-label="Filtrar por entidade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {(opts?.entities ?? []).map((e) => <SelectItem key={e} value={e}>{entityLabel(e)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="aud-q">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="aud-q" className="pl-9" placeholder="Texto…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} />
              </div>
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
              <Button onClick={apply}>Filtrar</Button>
              <Button variant="outline" onClick={clear} className="gap-2"><RotateCcw className="h-4 w-4" /> Limpar</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Data/hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Entidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => {
                    const tone = actionTone(l.action);
                    const expanded = open === l.id;
                    const hasDetails = !!l.details && Object.keys(l.details).length > 0;
                    return (
                      <Fragment key={l.id}>
                        <TableRow data-action={l.action} className={hasDetails ? "cursor-pointer" : ""} onClick={() => hasDetails && setOpen(expanded ? null : l.id)}>
                          <TableCell>
                            {hasDetails && (
                              <button type="button" aria-label={expanded ? "Ocultar detalhes" : "Ver detalhes"} aria-expanded={expanded} className="text-muted-foreground">
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</TableCell>
                          <TableCell className="text-sm">{l.userName || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={tone === "danger" ? "destructive" : tone === "warn" ? "outline" : "secondary"} className="whitespace-nowrap">{actionLabel(l.action)}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{l.description}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{entityLabel(l.entity)}</TableCell>
                        </TableRow>
                        {expanded && hasDetails && (
                          <TableRow>
                            <TableCell />
                            <TableCell colSpan={5}>
                              <pre data-testid="audit-details" className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(l.details, null, 2)}</pre>
                              {l.entityId && <p className="mt-1 text-xs text-muted-foreground">ID: {l.entityId}</p>}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {isLoading ? "Carregando…" : "Nenhum registro encontrado."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span data-testid="audit-range">{total === 0 ? "0 registros" : `Mostrando ${first}–${last} de ${total}`}{isFetching ? " …" : ""}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anteriores</Button>
            <Button variant="outline" size="sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Próximos</Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
