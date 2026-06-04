import { useState } from "react";
import { Search, UserPlus, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { Customer, LeadOrigin } from "@/types/inventory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const LEAD_ORIGINS: LeadOrigin[] = ["Instagram", "Indicação", "Tráfego Pago"];

export default function CustomersPage() {
  const { customers, addCustomer, deleteCustomer } = useInventoryContext();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCpf, setNewCpf] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newBirthday, setNewBirthday] = useState("");
  const [newLeadOrigin, setNewLeadOrigin] = useState<LeadOrigin>("Instagram");

  const filtered = search.trim()
    ? customers.filter((c) => {
        const q = search.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.cpf.includes(q) ||
          c.whatsapp.includes(q)
        );
      })
    : customers;

  const handleCreate = () => {
    if (!newName || !newCpf) return;
    addCustomer({ name: newName, cpf: newCpf, whatsapp: newWhatsapp, birthday: newBirthday, leadOrigin: newLeadOrigin });
    setShowNew(false);
    setNewName(""); setNewCpf(""); setNewWhatsapp(""); setNewBirthday("");
    toast.success("Cliente cadastrado!");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">Base de clientes cadastrados</p>
          </div>
          <Button onClick={() => setShowNew(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Novo Cliente
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF ou WhatsApp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="self-center">{filtered.length} clientes</Badge>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Aniversário</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.cpf}</TableCell>
                      <TableCell>{c.whatsapp}</TableCell>
                      <TableCell>{c.birthday || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{c.leadOrigin}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteCustomer(c.id)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhum cliente encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CPF *</Label>
                <Input value={newCpf} onChange={(e) => setNewCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={newWhatsapp} onChange={(e) => setNewWhatsapp(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Aniversário</Label>
                <Input type="date" value={newBirthday} onChange={(e) => setNewBirthday(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Origem do Lead</Label>
                <Select value={newLeadOrigin} onValueChange={(v) => setNewLeadOrigin(v as LeadOrigin)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_ORIGINS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={handleCreate}>Cadastrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
