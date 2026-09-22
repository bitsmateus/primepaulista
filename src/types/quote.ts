// "Expirado" não é gravado: é calculado pela data de validade
export type QuoteStatus = "Aberto" | "Enviado" | "Aprovado" | "Recusado" | "Convertido";
export type QuoteDisplayStatus = QuoteStatus | "Expirado";

export interface QuoteItem {
  id: string;
  type: "device" | "accessory";
  productId?: string; // aparelho/acessório do estoque (vazio = item avulso)
  name: string;
  serial?: string;
  price: number;
  quantity: number;
}

export interface Quote {
  id: string;
  number: number; // Orçamento nº
  customerId?: string;
  customerName: string;
  customerPhone: string;
  sellerId?: string; // usuário que criou (quem pode excluir, além do admin)
  sellerName: string;
  status: QuoteStatus;
  validUntil?: Date;
  subtotal: number;
  discount: number;
  total: number;
  paymentTerms: string;
  notes: string;
  convertedSaleId?: string;
  createdAt: Date;
  updatedAt: Date;
  items: QuoteItem[];
}

// O que o formulário envia para criar/editar
export interface QuoteInput {
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  sellerName: string;
  validUntil?: Date;
  discount: number;
  paymentTerms: string;
  notes: string;
  items: Array<Pick<QuoteItem, "type" | "productId" | "name" | "serial" | "price" | "quantity">>;
}
