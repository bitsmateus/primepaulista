import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, KeyRound, UserCheck, UserX, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { api, ApiError, ManagedUser, UserRole } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  tecnico: "Técnico",
};

const ROLE_HINT: Record<UserRole, string> = {
  admin: "Acesso total (financeiro, BI, configurações, usuários).",
  vendedor: "PDV, estoque, clientes e CRM. Sem financeiro/BI.",
  tecnico: "Assistência técnica e estoque. Sem financeiro/BI.",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  // ----- Criar usuário -----
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("vendedor");

  const createMut = useMutation({
    mutationFn: () => api.createUser({ name, email, password, role }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setName(""); setEmail(""); setPassword(""); setRole("vendedor");
      toast.success("Usuário criado!");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao criar usuário."),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateUser>[1] }) =>
      api.updateUser(id, patch),
    onSuccess: () => {
      invalidate();
      toast.success("Usuário atualizado!");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao atualizar."),
  });

  const handleResetPassword = (u: ManagedUser) => {
    const nova = window.prompt(`Nova senha para ${u.name} (mín. 6 caracteres):`);
    if (!nova) return;
    if (nova.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres.");
    updateMut.mutate({ id: u.id, patch: { password: nova } });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Usuários & Permissões</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie funcionários e defina o que cada um pode acessar
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo usuário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do funcionário" />
                </div>
                <div>
                  <Label>E-mail (login)</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                </div>
                <div>
                  <Label>Senha provisória</Label>
                  <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" />
                </div>
                <div>
                  <Label>Cargo / Permissão</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending || !name || !email || password.length < 6}
                >
                  {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar usuário
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = u.id === me?.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(v) => updateMut.mutate({ id: u.id, patch: { role: v as UserRole } })}
                            disabled={isSelf}
                          >
                            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="vendedor">Vendedor</SelectItem>
                              <SelectItem value="tecnico">Técnico</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {u.active ? (
                            <Badge variant="default">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => handleResetPassword(u)}
                          >
                            <KeyRound className="h-3.5 w-3.5" /> Senha
                          </Button>
                          {u.active ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-destructive"
                              disabled={isSelf}
                              onClick={() => updateMut.mutate({ id: u.id, patch: { active: false } })}
                            >
                              <UserX className="h-3.5 w-3.5" /> Desativar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-success"
                              onClick={() => updateMut.mutate({ id: u.id, patch: { active: true } })}
                            >
                              <UserCheck className="h-3.5 w-3.5" /> Ativar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
