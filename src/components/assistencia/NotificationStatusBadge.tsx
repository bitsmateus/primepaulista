import { Badge } from "@/components/ui/badge";
import { NotificationStatus } from "@/types/serviceOrder";

const LABEL: Record<NotificationStatus, string> = {
  sent: "Enviado",
  failed: "Falhou",
  pending: "Pendente",
};

const STYLE: Record<NotificationStatus, string> = {
  sent: "bg-success/10 text-success border-transparent",
  failed: "bg-destructive/10 text-destructive border-transparent",
  pending: "bg-warning/10 text-warning border-transparent",
};

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return (
    <Badge variant="outline" className={`h-5 text-[10px] ${STYLE[status]}`} data-testid="notif-status">
      {LABEL[status]}
    </Badge>
  );
}
