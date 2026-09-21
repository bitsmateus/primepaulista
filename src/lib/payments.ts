import { PaymentMethod } from "@/types/inventory";

// Formas de pagamento aceitas (mesma lista do enum do banco)
export const PAYMENT_METHODS: PaymentMethod[] = [
  "PIX",
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Mercado Pago / Link de Pagamento",
  "Outro / Verificação Externa",
];

const CARD_METHODS: PaymentMethod[] = ["Cartão de Crédito", "Cartão de Débito"];

// Cartão de crédito ou débito (é o que paga a taxa da maquininha)
export function isCardMethod(method: string): boolean {
  return CARD_METHODS.includes(method as PaymentMethod);
}

// Só o crédito parcela
export function allowsInstallments(method: string): boolean {
  return method === "Cartão de Crédito";
}
