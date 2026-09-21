// Preparo do logo da loja: valida (png/jpg/webp, até 2 MB) e reduz no navegador para até 512 px.

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_SIDE = 512;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function validateLogoFile(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "Use uma imagem PNG, JPG ou WEBP.";
  if (file.size > LOGO_MAX_BYTES) return "A imagem deve ter no máximo 2 MB.";
  if (file.size === 0) return "Arquivo vazio.";
  return null;
}

// Dimensões finais mantendo a proporção, sem ampliar
export function fitWithin(width: number, height: number, max = LOGO_MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
    img.src = src;
  });

// Devolve um data URL já reduzido (mantém o formato; JPEG/WEBP com qualidade 0,9)
export async function fileToLogoDataUrl(file: File): Promise<string> {
  const err = validateLogoFile(file);
  if (err) throw new Error(err);
  const img = await loadImage(await readAsDataUrl(file));
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(img, 0, 0, width, height);
  const out = canvas.toDataURL(file.type, 0.9);
  // Formato não suportado pelo navegador cai em PNG
  return /^data:image\/(png|jpeg|webp);base64,/.test(out) ? out : canvas.toDataURL("image/png");
}
