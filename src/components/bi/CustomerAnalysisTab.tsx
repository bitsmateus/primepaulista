import { useMemo } from "react";
import { Users, UserCheck, UserX, Target } from "lucide-react";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useCRMContext } from "@/contexts/CRMContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

export function CustomerAnalysisTab() {
  const { customers, sales } = useInventoryContext();
  const { leads } = useCRMContext();

  const analysis = useMemo(() => {
    const buyerIds = new Set(sales.map((s) => s.customer.id).filter(Boolean));
    const buyerPhones = new Set(
      customers.filter((c) => buyerIds.has(c.id)).map((c) => onlyDigits(c.whatsapp))
    );

    const compraram = customers.filter((c) => buyerIds.has(c.id));
    const naoCompraram = customers.filter((c) => !buyerIds.has(c.id));
    const leadsConvertidos = leads.filter((l) => buyerPhones.has(onlyDigits(l.phone)));

    return { compraram, naoCompraram, leadsConvertidos };
  }, [customers, sales, leads]);

  const cards = [
    { label: "Clientes cadastrados", value: customers.length, icon: Users, color: "text-blue-600" },
    { label: "Compraram", value: analysis.compraram.length, icon: UserCheck, color: "text-green-600" },
    { label: "Não compraram", value: analysis.naoCompraram.length, icon: UserX, color: "text-orange-600" },
    { label: "Leads convertidos", value: analysis.leadsConvertidos.length, icon: Target, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-4 py-5">
              <c.icon className={`h-8 w-8 ${c.color}`} />
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Oportunidades — clientes cadastrados que ainda não compraram
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analysis.naoCompraram.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos os clientes cadastrados já realizaram pelo menos uma compra. 🎉
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.naoCompraram.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.whatsapp || "—"}</TableCell>
                    <TableCell>{c.leadOrigin || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
