import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Expense, Sangria, DailyCashEntry } from "@/types/financial";
import { Sale, Seller } from "@/types/inventory";
import { ServiceOrder } from "@/types/serviceOrder";
import { Device, Accessory } from "@/types/inventory";
import { api } from "@/lib/api";
import { salesGrossProfit, buildDeviceMap, buildAccessoryMap } from "@/lib/profit";
import { format, subDays, differenceInDays, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";

export function useFinancial(sales: Sale[], serviceOrders: ServiceOrder[], devices: Device[], accessories: Accessory[]) {
  const qc = useQueryClient();

  // Dados financeiros persistidos no banco
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: api.listExpenses });
  const { data: sangrias = [] } = useQuery({ queryKey: ["sangrias"], queryFn: api.listSangrias });
  const { data: commissionConfigs = [] } = useQuery({ queryKey: ["commissions"], queryFn: api.listCommissions });
  const cardTaxRate = 2.5;

  const addExpenseMut = useMutation({
    mutationFn: (e: Omit<Expense, "id">) => api.createExpense(e),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
  const deleteExpenseMut = useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
  const addSangriaMut = useMutation({
    mutationFn: (s: Omit<Sangria, "id">) => api.createSangria(s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sangrias"] }),
  });
  const updateCommissionMut = useMutation({
    mutationFn: ({ seller, patch }: { seller: string; patch: { devicePercent?: number; accessoryPercent?: number } }) =>
      api.updateCommission(seller, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions"] }),
  });

  const addExpense = (expense: Omit<Expense, "id">) => addExpenseMut.mutate(expense);
  const deleteExpense = (id: string) => deleteExpenseMut.mutate(id);
  const addSangria = (sangria: Omit<Sangria, "id">) => addSangriaMut.mutate(sangria);
  const updateCommission = (seller: string, field: "devicePercent" | "accessoryPercent", value: number) =>
    updateCommissionMut.mutate({ seller, patch: { [field]: value } });

  // Current month
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  const inRange = (d: Date, start: Date, end: Date) =>
    isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) });

  // Vendas devolvidas não entram em faturamento nem lucro
  const activeSales = sales.filter(s => !s.returnedAt);

  // Revenue from sales
  const currentMonthSales = activeSales.filter(s => inRange(s.createdAt, monthStart, monthEnd));
  const prevMonthSales = activeSales.filter(s => inRange(s.createdAt, prevMonthStart, prevMonthEnd));

  const grossRevenueSales = currentMonthSales.reduce((s, sale) => s + sale.total, 0);
  const prevGrossRevenueSales = prevMonthSales.reduce((s, sale) => s + sale.total, 0);

  // Revenue from services
  const completedOS = serviceOrders.filter(o => o.status === "Entregue / Finalizado" && o.completedAt && inRange(o.completedAt, monthStart, monthEnd));
  const prevCompletedOS = serviceOrders.filter(o => o.status === "Entregue / Finalizado" && o.completedAt && inRange(o.completedAt, prevMonthStart, prevMonthEnd));

  const grossRevenueServices = completedOS.reduce((s, o) => s + o.chargedAmount, 0);
  const prevGrossRevenueServices = prevCompletedOS.reduce((s, o) => s + o.chargedAmount, 0);

  const grossRevenue = grossRevenueSales + grossRevenueServices;
  const prevGrossRevenue = prevGrossRevenueSales + prevGrossRevenueServices;

  const devicesById = buildDeviceMap(devices);
  const accessoriesById = buildAccessoryMap(accessories);

  // ----- Custos (helpers reaproveitados para mês atual e anterior) -----
  const sumCost = (list: Sale[], type: "device" | "accessory") =>
    list.reduce((s, sale) => s + sale.items.filter(i => i.type === type).reduce((sum, item) => {
      const cost = type === "device"
        ? (item.deviceId ? devicesById[item.deviceId]?.cost ?? 0 : 0)
        : (item.accessoryId ? accessoriesById[item.accessoryId]?.cost ?? 0 : 0);
      return sum + cost * item.quantity;
    }, 0), 0);

  const cardTaxesOf = (list: Sale[]) => {
    const cardPayments = list.reduce((s, sale) =>
      s + sale.payments.filter(p => p.method === "Cartão de Crédito" || p.method === "Cartão de Débito")
        .reduce((sum, p) => sum + p.amount, 0), 0);
    return cardPayments * (cardTaxRate / 100);
  };

  const commissionsOf = (list: Sale[]) =>
    list.reduce((total, sale) => {
      const cfg = commissionConfigs.find(c => c.seller === sale.seller);
      if (!cfg) return total;
      return total + sale.items.reduce((s, item) => {
        const pct = item.type === "device" ? cfg.devicePercent : cfg.accessoryPercent;
        return s + (item.price * item.quantity * pct / 100);
      }, 0);
    }, 0);

  const expensesIn = (start: Date, end: Date) =>
    expenses.filter(e => inRange(e.date, start, end)).reduce((s, e) => s + e.amount, 0);

  const deviceCosts = sumCost(currentMonthSales, "device");
  const accessoryCosts = sumCost(currentMonthSales, "accessory");
  const partCosts = completedOS.reduce((s, o) => s + o.partCost, 0);
  const cardTaxes = cardTaxesOf(currentMonthSales);

  // Comissões por vendedor (mês atual) para a aba Equipe
  const sellerCommissions = useMemo(() => {
    const result: Record<string, number> = {};
    currentMonthSales.forEach(sale => {
      const cfg = commissionConfigs.find(c => c.seller === sale.seller);
      if (!cfg) return;
      sale.items.forEach(item => {
        const pct = item.type === "device" ? cfg.devicePercent : cfg.accessoryPercent;
        result[sale.seller] = (result[sale.seller] || 0) + (item.price * item.quantity * pct / 100);
      });
    });
    return result;
  }, [currentMonthSales, commissionConfigs]);
  const totalCommissions = Object.values(sellerCommissions).reduce((s, v) => s + v, 0);

  // Despesas do MÊS (não o histórico inteiro) para o lucro mensal
  const totalExpenses = expensesIn(monthStart, monthEnd);

  // Margem bruta das vendas (custo real device + acessório, exclui devolvidas) — mesma
  // função usada no Dashboard, para os números baterem entre as telas.
  const salesProfit = salesGrossProfit(currentMonthSales, devicesById, accessoriesById);
  // Lucro dos serviços (mão de obra é receita, não custo): cobrado − peça − taxas.
  const servicesProfit = completedOS.reduce((s, o) => s + (o.chargedAmount - o.partCost - o.taxes), 0);

  const netProfit = salesProfit + servicesProfit - cardTaxes - totalCommissions - totalExpenses;

  // Lucro do mês anterior pela MESMA fórmula (antes era um placeholder inventado)
  const prevSalesProfit = salesGrossProfit(prevMonthSales, devicesById, accessoriesById);
  const prevServicesProfit = prevCompletedOS.reduce((s, o) => s + (o.chargedAmount - o.partCost - o.taxes), 0);
  const prevNetProfit =
    prevSalesProfit + prevServicesProfit - cardTaxesOf(prevMonthSales) - commissionsOf(prevMonthSales) - expensesIn(prevMonthStart, prevMonthEnd);

  // Daily cash
  const getDailyCash = (dateStr: string): DailyCashEntry => {
    const daySales = activeSales.filter(s => format(s.createdAt, "yyyy-MM-dd") === dateStr);
    const daySangrias = sangrias.filter(s => format(s.date, "yyyy-MM-dd") === dateStr);
    const pix = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "PIX").reduce((sum, p) => sum + p.amount, 0), 0);
    const dinheiro = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "Dinheiro").reduce((sum, p) => sum + p.amount, 0), 0);
    const creditCard = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "Cartão de Crédito").reduce((sum, p) => sum + p.amount, 0), 0);
    const debitCard = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "Cartão de Débito").reduce((sum, p) => sum + p.amount, 0), 0);
    const sangriaTotal = daySangrias.reduce((s, sg) => s + sg.amount, 0);
    return { date: dateStr, pix, dinheiro, creditCard, debitCard, sangrias: sangriaTotal, total: pix + dinheiro + creditCard + debitCard - sangriaTotal };
  };

  // Seller performance — vendedores derivados das comissões + vendas (não fixo)
  const sellerPerformance = useMemo(() => {
    const names = new Set<string>();
    commissionConfigs.forEach(c => names.add(c.seller));
    currentMonthSales.forEach(s => { if (s.seller) names.add(s.seller); });
    return Array.from(names).map(seller => {
      const sellerSales = currentMonthSales.filter(s => s.seller === seller);
      const totalRevenue = sellerSales.reduce((s, sale) => s + sale.total, 0);
      const totalProfit = salesGrossProfit(sellerSales, devicesById, accessoriesById);
      const totalItems = sellerSales.reduce((s, sale) => s + sale.items.length, 0);
      const accessoryItems = sellerSales.reduce((s, sale) => s + sale.items.filter(i => i.type === "accessory").length, 0);
      const deviceItems = sellerSales.reduce((s, sale) => s + sale.items.filter(i => i.type === "device").length, 0);
      // Ticket médio = lucro total do vendedor / qtd de vendas (não receita bruta).
      const avgTicket = sellerSales.length > 0 ? totalProfit / sellerSales.length : 0;
      const accessoryRate = totalItems > 0 ? (accessoryItems / totalItems) * 100 : 0;
      return {
        seller,
        salesCount: sellerSales.length,
        totalRevenue,
        avgTicket,
        accessoryRate,
        devicesSold: deviceItems,
        accessoriesSold: accessoryItems,
        commission: sellerCommissions[seller] || 0,
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [currentMonthSales, sellerCommissions, commissionConfigs, devicesById, accessoriesById]);

  // Inventory ABC / Stale
  const staleDevices = useMemo(() => {
    return devices
      .filter(d => d.status === "Disponível" || d.status === "Reservado")
      .map(d => ({ ...d, daysInStock: differenceInDays(now, d.createdAt) }))
      .filter(d => d.daysInStock > 30)
      .sort((a, b) => b.daysInStock - a.daysInStock);
  }, [devices]);

  const staleAccessories = useMemo(() => {
    return accessories
      .filter(a => a.quantity > 0)
      .map(a => ({ ...a, daysInStock: differenceInDays(now, a.createdAt), totalValue: a.cost * a.quantity }))
      .filter(a => a.daysInStock > 30)
      .sort((a, b) => b.daysInStock - a.daysInStock);
  }, [accessories]);

  const totalStaleValue = staleDevices.reduce((s, d) => s + d.cost, 0) + staleAccessories.reduce((s, a) => s + a.totalValue, 0);

  // Revenue trend (last 7 days)
  const revenueTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(now, 6 - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const daySales = activeSales.filter(s => format(s.createdAt, "yyyy-MM-dd") === dateStr);
      const revenue = daySales.reduce((s, sale) => s + sale.total, 0);
      return { date: format(date, "dd/MM"), revenue };
    });
  }, [sales]);

  // Expense distribution
  const expenseDistribution = useMemo(() => {
    const grouped: Record<string, number> = {};
    expenses.forEach(e => {
      grouped[e.category] = (grouped[e.category] || 0) + e.amount;
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  // Monthly comparison
  const monthlyComparison = useMemo(() => {
    return [
      { name: "Mês Anterior", faturamento: prevGrossRevenue, lucro: prevNetProfit },
      { name: "Mês Atual", faturamento: grossRevenue, lucro: netProfit },
    ];
  }, [grossRevenue, netProfit, prevGrossRevenue, prevNetProfit]);

  // Open OS count
  const openOSCount = serviceOrders.filter(o => o.status !== "Entregue / Finalizado").length;
  const osServiceProfit = servicesProfit;
  const pendingOver3Days = serviceOrders.filter(o => o.status !== "Entregue / Finalizado" && differenceInDays(now, o.createdAt) > 3).length;

  return {
    expenses, addExpense, deleteExpense,
    sangrias, addSangria,
    commissionConfigs, updateCommission,
    grossRevenue, prevGrossRevenue,
    netProfit, prevNetProfit,
    deviceCosts, accessoryCosts, partCosts, cardTaxes, totalCommissions, totalExpenses,
    getDailyCash,
    sellerPerformance,
    staleDevices, staleAccessories, totalStaleValue,
    revenueTrend, expenseDistribution, monthlyComparison,
    openOSCount, osServiceProfit, pendingOver3Days,
  };
}
