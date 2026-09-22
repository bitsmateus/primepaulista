import { useQuery } from "@tanstack/react-query";
import { Pencil, Tag } from "lucide-react";
import { Device, DeviceStatus } from "@/types/inventory";
import { api } from "@/lib/api";
import { daysInStock, deviceMargin, deviceMarginPct } from "@/lib/devices";
import { formatCapacity } from "@/lib/utils";
import { printDeviceLabel } from "@/utils/labelGenerator";
import { DevicePhotos } from "@/components/devices/DevicePhotos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: Date | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtDateTime = (d: Date) =>
  new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const statusVariant: Record<DeviceStatus, "available" | "sold" | "maintenance" | "reserved"> = {
  "Disponível": "available",
  "Vendido": "sold",
  "Em Manutenção": "maintenance",
  "Reservado": "reserved",
};

interface Props {
  device: Device | null;
  onClose: () => void;
  onEdit: (d: Device) => void;
  showCost: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground break-words">{children || "—"}</p>
    </div>
  );
}

export function DeviceDetailDialog({ device, onClose, onEdit, showCost }: Props) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["device-history", device?.id],
    queryFn: () => api.deviceHistory(device!.id),
    enabled: !!device,
  });

  if (!device) return null;
  const margin = deviceMargin(device);
  const pct = deviceMarginPct(device);
  const label = `${device.model} ${formatCapacity(device.capacity)} ${device.color}`.trim();

  return (
    <Dialog open={!!device} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <DialogTitle>{label}</DialogTitle>
            <Badge variant={statusVariant[device.status]}>{device.status}</Badge>
          </div>
          <DialogDescription>Ficha do aparelho</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Categoria">{device.category}</Field>
          <Field label="Marca">{device.brand}</Field>
          <Field label="Localização">{device.location}</Field>
          <Field label="Condição">{device.condition}</Field>
          <Field label="Saúde da bateria">{`${device.batteryHealth}%`}</Field>
          <Field label="Fornecedor">{device.supplier}</Field>
          <Field label="IMEI 1"><span className="font-mono">{device.serialImei}</span></Field>
          <Field label="IMEI 2"><span className="font-mono">{device.imei2}</span></Field>
          <Field label="Serial"><span className="font-mono">{device.serial}</span></Field>
          <Field label="Serial interno"><span className="font-mono">{device.internalSerial}</span></Field>
          <Field label="Data de entrada">{fmtDate(device.entryDate ?? device.createdAt)}</Field>
          <Field label="Em estoque há">
            {device.status === "Vendido" ? "—" : `${daysInStock(device.entryDate ?? device.createdAt)} dias`}
          </Field>
          <Field label="Preço de venda">{device.salePrice != null ? fmt(device.salePrice) : "—"}</Field>
          {showCost && <Field label="Custo">{fmt(device.cost)}</Field>}
          {showCost && (
            <Field label="Margem">
              {margin != null ? `${fmt(margin)} (${(pct ?? 0).toFixed(0)}%)` : "—"}
            </Field>
          )}
          <Field label="Última conferência">
            {device.checkedAt ? fmtDate(device.checkedAt) : "Não conferido"}
          </Field>
          <Field label="Cadastrado em">{fmtDate(device.createdAt)}</Field>
        </div>

        {device.notes && (
          <div>
            <p className="text-xs text-muted-foreground">Observações</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{device.notes}</p>
          </div>
        )}

        <div className="border-t pt-3">
          <DevicePhotos deviceId={device.id} />
        </div>

        <div className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-semibold text-foreground">Vendas</h3>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {history && history.sales.length === 0 && (
            <p className="text-sm text-muted-foreground">Este aparelho ainda não foi vendido.</p>
          )}
          {history?.sales.map((s) => (
            <div key={s.saleId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">{s.customerName ?? "Cliente não informado"}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(s.createdAt)}
                  {s.sellerName ? ` · Vendedor: ${s.sellerName}` : ""}
                  {s.warrantyDays ? ` · Garantia: ${s.warrantyDays} dias` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{fmt(s.price)}</span>
                {s.returnedAt && <Badge variant="destructive">Devolvida</Badge>}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-semibold text-foreground">Histórico de movimentações</h3>
          {history && history.movements.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
          )}
          <ul className="space-y-1">
            {history?.movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={m.movementType === "entrada" ? "available" : "secondary"}>
                  {m.movementType === "entrada" ? "Entrada" : "Saída"}
                </Badge>
                <span className="text-foreground">{m.reason || "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtDateTime(m.createdAt)}{m.userName ? ` · ${m.userName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              printDeviceLabel({
                model: device.model, capacity: device.capacity, batteryHealth: device.batteryHealth,
                color: device.color, serial: device.serial || device.internalSerial || device.serialImei,
              })
            }
          >
            <Tag className="h-4 w-4" /> Imprimir etiqueta
          </Button>
          <Button className="gap-2" onClick={() => { onEdit(device); onClose(); }}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
