import { useState, useMemo } from "react";
import { Expense, ExpenseCategory, Sangria, SellerCommissionConfig, DailyCashEntry } from "@/types/financial";
import { Sale, Seller } from "@/types/inventory";
import { ServiceOrder } from "@/types/serviceOrder";
import { Device, Accessory } from "@/types/inventory";
import { format, subDays, differenceInDays, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";

const defaultCommissions: SellerCommissionConfig[] = [
  { seller: "Gabriel", devicePercent: 3, accessoryPercent: 10 },
  { seller: "Matheus", devicePercent: 3, accessoryPercent: 10 },
  { seller: "Tassio", devicePercent: 3, accessoryPercent: 10 },
];

const sampleExpenses: Expense[] = [
  { id: "1", description: "Aluguel da loja", category: "Aluguel", amount: 4500, date: new Date(), recurring: true },
  { id: "2", description: "Condomínio", category: "Condomínio", amount: 800, date: new Date(), recurring: true },
  { id: "3", description: "DAS MEI", category: "Impostos (MEI)", amount: 71.60, date: new Date(), recurring: true },
  { id: "4", description: "Facebook Ads", category: "Tráfego Pago", amount: 1200, date: new Date(), recurring: true },
  { id: "5", description: "Pro-labore", category: "Pro-labore", amount: 3000, date: new Date(), recurring: true },
];

export function useFinancial(sales: Sale[], serviceOrders: ServiceOrder[], devices: Device[], accessories: Accessory[]) {
  const [expenses, setExpenses] = useState<Expense[]>(sampleExpenses);
  const [sangrias, setSangrias] = useState<Sangria[]>([]);
  const [commissionConfigs, setCommissionConfigs] = useState<SellerCommissionConfig[]>(defaultCommissions);
  const [cardTaxRate] = useState(2.5);

  const addExpense = (expense: Omit<Expense, "id">) => {
    setExpenses(prev => [{ ...expense, id: crypto.randomUUID() }, ...prev]);
  };

  const deleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const addSangria = (sangria: Omit<Sangria, "id">) => {
    setSangrias(prev => [{ ...sangria, id: crypto.randomUUID() }, ...prev]);
  };

  const updateCommission = (seller: string, field: "devicePercent" | "accessoryPercent", value: number) => {
    setCommissionConfigs(prev => prev.map(c => c.seller === seller ? { ...c, [field]: value } : c));
  };

  // Current month
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  const inRange = (d: Date, start: Date, end: Date) =>
    isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) });

  // Revenue from sales
  const currentMonthSales = sales.filter(s => inRange(s.createdAt, monthStart, monthEnd));
  const prevMonthSales = sales.filter(s => inRange(s.createdAt, prevMonthStart, prevMonthEnd));

  const grossRevenueSales = currentMonthSales.reduce((s, sale) => s + sale.total, 0);
  const prevGrossRevenueSales = prevMonthSales.reduce((s, sale) => s + sale.total, 0);

  // Revenue from services
  const completedOS = serviceOrders.filter(o => o.status === "Entregue / Finalizado" && o.completedAt && inRange(o.completedAt, monthStart, monthEnd));
  const prevCompletedOS = serviceOrders.filter(o => o.status === "Entregue / Finalizado" && o.completedAt && inRange(o.completedAt, prevMonthStart, prevMonthEnd));

  const grossRevenueServices = completedOS.reduce((s, o) => s + o.chargedAmount, 0);
  const prevGrossRevenueServices = prevCompletedOS.reduce((s, o) => s + o.chargedAmount, 0);

  const grossRevenue = grossRevenueSales + grossRevenueServices;
  const prevGrossRevenue = prevGrossRevenueSales + prevGrossRevenueServices;

  // Costs
  const deviceCosts = currentMonthSales.reduce((s, sale) => {
    return s + sale.items.filter(i => i.type === "device").reduce((sum, item) => {
      const dev = devices.find(d => d.id === item.deviceId);
      return sum + (dev?.cost || 0);
    }, 0);
  }, 0);

  const partCosts = completedOS.reduce((s, o) => s + o.partCost, 0);

  const cardPayments = currentMonthSales.reduce((s, sale) => {
    return s + sale.payments.filter(p => p.method === "Cartão de Crédito" || p.method === "Cartão de Débito").reduce((sum, p) => sum + p.amount, 0);
  }, 0);
  const cardTaxes = cardPayments * (cardTaxRate / 100);

  // Commissions
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

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const netProfit = grossRevenue - deviceCosts - partCosts - cardTaxes - totalCommissions - totalExpenses;
  const prevNetProfit = prevGrossRevenue - totalExpenses * 0.95; // approximate prev month

  // Daily cash
  const getDailyCash = (dateStr: string): DailyCashEntry => {
    const daySales = sales.filter(s => format(s.createdAt, "yyyy-MM-dd") === dateStr);
    const daySangrias = sangrias.filter(s => format(s.date, "yyyy-MM-dd") === dateStr);
    const pix = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "PIX").reduce((sum, p) => sum + p.amount, 0), 0);
    const dinheiro = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "Dinheiro").reduce((sum, p) => sum + p.amount, 0), 0);
    const creditCard = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "Cartão de Crédito").reduce((sum, p) => sum + p.amount, 0), 0);
    const debitCard = daySales.reduce((s, sale) => s + sale.payments.filter(p => p.method === "Cartão de Débito").reduce((sum, p) => sum + p.amount, 0), 0);
    const sangriaTotal = daySangrias.reduce((s, sg) => s + sg.amount, 0);
    return { date: dateStr, pix, dinheiro, creditCard, debitCard, sangrias: sangriaTotal, total: pix + dinheiro + creditCard + debitCard - sangriaTotal };
  };

  // Seller performance
  const sellerPerformance = useMemo(() => {
    const sellers: Seller[] = ["Gabriel", "Matheus", "Tassio"];
    return sellers.map(seller => {
      const sellerSales = currentMonthSales.filter(s => s.seller === seller);
      const totalRevenue = sellerSales.reduce((s, sale) => s + sale.total, 0);
      const totalItems = sellerSales.reduce((s, sale) => s + sale.items.length, 0);
      const accessoryItems = sellerSales.reduce((s, sale) => s + sale.items.filter(i => i.type === "accessory").length, 0);
      const deviceItems = sellerSales.reduce((s, sale) => s + sale.items.filter(i => i.type === "device").length, 0);
      const avgTicket = sellerSales.length > 0 ? totalRevenue / sellerSales.length : 0;
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
  }, [currentMonthSales, sellerCommissions]);

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
      const daySales = sales.filter(s => format(s.createdAt, "yyyy-MM-dd") === dateStr);
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
  const osServiceProfit = completedOS.reduce((s, o) => s + (o.chargedAmount - o.partCost - o.taxes), 0);
  const pendingOver3Days = serviceOrders.filter(o => o.status !== "Entregue / Finalizado" && differenceInDays(now, o.createdAt) > 3).length;

  return {
    expenses, addExpense, deleteExpense,
    sangrias, addSangria,
    commissionConfigs, updateCommission,
    grossRevenue, prevGrossRevenue,
    netProfit, prevNetProfit,
    deviceCosts, partCosts, cardTaxes, totalCommissions, totalExpenses,
    getDailyCash,
    sellerPerformance,
    staleDevices, staleAccessories, totalStaleValue,
    revenueTrend, expenseDistribution, monthlyComparison,
    openOSCount, osServiceProfit, pendingOver3Days,
  };
}
