import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { useQuickReplies } from "@/hooks/useCRMExtras";
import { useStoreSnapshot } from "@/hooks/useAppSettings";
import { renderReplyTemplate } from "@/lib/crmText";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Botão "Respostas rápidas" da conversa do lead: insere o texto já com as variáveis resolvidas
// (nome/modelo do lead e dados da loja).
export default function QuickReplyPicker({
  lead,
  onPick,
}: {
  lead: { name: string; modelInterest?: string };
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { quickReplies, isLoading } = useQuickReplies();
  const store = useStoreSnapshot();
  const list = quickReplies.filter((q) => q.active);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1" aria-label="Respostas rápidas">
          <MessageSquareText className="h-4 w-4" /> Respostas rápidas
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1" align="start">
        <div className="max-h-72 overflow-y-auto" data-testid="quick-reply-picker">
          {isLoading && <p className="p-3 text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && list.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma resposta rápida cadastrada.</p>}
          {list.map((q) => (
            <button
              key={q.id}
              type="button"
              data-testid="quick-reply-option"
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onPick(
                  renderReplyTemplate(q.body, {
                    name: lead.name, model: lead.modelInterest, storeName: store.name, address: store.address, pixKey: store.pixKey,
                  })
                );
                setOpen(false);
              }}
            >
              <span className="block font-medium">{q.title}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{q.category} · {q.body}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
