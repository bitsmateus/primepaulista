// Catálogo de dispositivos Apple — usado como sugestões (o usuário pode digitar livremente)
import { DeviceCategory } from "@/types/inventory";

export const DEVICE_CATEGORIES: DeviceCategory[] = [
  "iPhone",
  "iPad",
  "Apple Watch",
  "Mac",
  "AirPods",
  "Outro",
];

export const MODELS_BY_CATEGORY: Record<DeviceCategory, string[]> = {
  iPhone: [
    "iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17 Air", "iPhone 17",
    "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16", "iPhone 16e",
    "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
    "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
    "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13", "iPhone 13 mini",
    "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12", "iPhone 12 mini",
    "iPhone 11 Pro Max", "iPhone 11 Pro", "iPhone 11",
    "iPhone SE (3ª geração)", "iPhone SE (2ª geração)",
    "iPhone XS Max", "iPhone XS", "iPhone XR", "iPhone X",
  ],
  iPad: [
    "iPad Pro 13\" (M4)", "iPad Pro 11\" (M4)",
    "iPad Air 13\" (M3)", "iPad Air 11\" (M3)",
    "iPad (11ª geração)", "iPad mini (7ª geração)",
    "iPad Pro 12.9\" (M2)", "iPad Pro 11\" (M2)",
    "iPad Air (5ª geração)", "iPad (10ª geração)", "iPad (9ª geração)",
    "iPad mini (6ª geração)",
  ],
  "Apple Watch": [
    "Apple Watch Series 10", "Apple Watch Ultra 2", "Apple Watch SE (2ª geração)",
    "Apple Watch Series 9", "Apple Watch Ultra", "Apple Watch Series 8",
    "Apple Watch Series 7", "Apple Watch SE", "Apple Watch Series 6",
  ],
  Mac: [
    "MacBook Air 13\" (M4)", "MacBook Air 15\" (M4)",
    "MacBook Pro 14\" (M4)", "MacBook Pro 16\" (M4)",
    "MacBook Air 13\" (M3)", "MacBook Air 15\" (M3)", "MacBook Pro 14\" (M3)",
    "iMac 24\" (M4)", "Mac mini (M4)", "Mac Studio (M4)", "Mac Pro",
    "MacBook Air (M2)", "MacBook Pro 13\" (M2)",
  ],
  AirPods: [
    "AirPods Pro 3", "AirPods Pro 2", "AirPods 4 (com cancelamento)", "AirPods 4",
    "AirPods Max (USB-C)", "AirPods Max",
    "AirPods (3ª geração)", "AirPods (2ª geração)", "AirPods Pro",
  ],
  Outro: [],
};

// Sugestões de capacidade/tamanho por categoria (o usuário também pode digitar)
export const CAPACITIES_BY_CATEGORY: Record<DeviceCategory, string[]> = {
  iPhone: ["128", "256", "512", "1024"],
  iPad: ["64", "128", "256", "512", "1024", "2048"],
  "Apple Watch": ["40mm", "41mm", "42mm", "44mm", "45mm", "46mm", "49mm"],
  Mac: ["256GB", "512GB", "1TB", "2TB", "4TB"],
  AirPods: [],
  Outro: [],
};
