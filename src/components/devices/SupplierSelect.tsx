import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useSuppliers, useSupplierMutations } from "@/hooks/useSuppliers";
import { findSupplierByName, normSupplierName } from "@/lib/suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SupplierValue {
  supplierId: string | null;
  name: string; // nome exibido (texto livre quando não há cadastro)
}

interface Props {
  value: SupplierValue;
  onChange: (v: SupplierValue) => void;
  canCreate: boolean; // pode cadastrar fornecedor novo na hora
  ariaLabel?: string;
  placeholder?: string;
}

// Seleção de fornecedor com busca (lista de ativos) + "cadastrar novo" na hora.
// Quem não pode cadastrar (ex.: vendedor) ainda pode usar um nome livre, sem vínculo com o cadastro.
export function SupplierSelect({ value, onChange, canCreate, ariaLabel = "Fornecedor", placeholder = "Selecionar fornecedor" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: suppliers = [] } = useSuppliers({ active: true });
  const { create } = useSupplierMutations();

  const list = useMemo(() => {
    const q = normSupplierName(search);
    return suppliers.filter((s) => !q || normSupplierName(s.name).includes(q));
  }, [suppliers, search]);
  const exact = findSupplierByName(suppliers, search);
  const typed = search.trim().replace(/\s+/g, " ");

  const pick = (v: SupplierValue) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  const createNew = async () => {
    try {
      const s = await create.mutateAsync({ name: typed });
      toast.success(`Fornecedor "${s.name}" cadastrado.`);
      pick({ supplierId: s.id, name: s.name });
    } catch (err) {
      if (!(err instanceof ApiError)) toast.error("Não foi possível cadastrar o fornecedor.");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={ariaLabel} className="w-full justify-between font-normal">
          <span className={value.name ? "truncate" : "truncate text-muted-foreground"}>{value.name || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-2" align="start">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar fornecedor…"
          aria-label="Buscar fornecedor"
        />
        <div role="listbox" aria-label="Fornecedores" className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
          {value.name && (
            <button type="button" role="option" aria-selected={false} onClick={() => pick({ supplierId: null, name: "" })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent">
              <X className="h-4 w-4" /> Sem fornecedor
            </button>
          )}
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={value.supplierId === s.id}
              onClick={() => pick({ supplierId: s.id, name: s.name })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Check className={`h-4 w-4 ${value.supplierId === s.id ? "opacity-100" : "opacity-0"}`} />
              <span className="truncate">{s.name}</span>
            </button>
          ))}
          {list.length === 0 && !typed && <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>}
          {typed && !exact && canCreate && (
            <button type="button" role="option" aria-selected={false} onClick={createNew} disabled={create.isPending} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Cadastrar “{typed}” como novo fornecedor
            </button>
          )}
          {typed && !exact && !canCreate && (
            <button type="button" role="option" aria-selected={false} onClick={() => pick({ supplierId: null, name: typed })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
              <Plus className="h-4 w-4" /> Usar “{typed}” (sem cadastro)
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
