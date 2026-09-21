import { useEffect, useId, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Recebe o texto lido (IMEI, serial, SKU…)
  onDetected: (code: string) => void;
  title?: string;
  description?: string;
  // Mantém a câmera aberta depois de ler (ex.: balanço de estoque)
  continuous?: boolean;
}

// Ignora a mesma leitura repetida em sequência (a câmera lê o mesmo código várias vezes)
const REPEAT_WINDOW_MS = 2500;

export function BarcodeScannerDialog({
  open, onOpenChange, onDetected, title = "Escanear código",
  description = "Aponte a câmera para o código de barras ou QR Code.", continuous = false,
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const elementId = `barcode-reader-${reactId}`;
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const lastRead = useRef<{ code: string; at: number } | null>(null);
  // O callback muda a cada render do pai; a câmera não pode reiniciar por isso
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let started = false;

    const start = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const el = document.getElementById(elementId);
        if (!el) return;
        scanner = new Html5Qrcode(elementId, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
        });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 } },
          (text) => {
            const now = Date.now();
            const last = lastRead.current;
            if (last && last.code === text && now - last.at < REPEAT_WINDOW_MS) return;
            lastRead.current = { code: text, at: now };
            onDetectedRef.current(text.trim());
            if (!continuousRef.current) onOpenChangeRef.current(false);
          },
          () => { /* quadro sem código: ignorar */ }
        );
        started = true;
        if (cancelled) await stop();
      } catch {
        if (!cancelled) {
          setError("Não foi possível iniciar a câmera. Verifique a permissão do navegador ou digite o código abaixo.");
        }
      }
    };

    const stop = async () => {
      try {
        if (scanner && started) {
          await scanner.stop();
          scanner.clear();
        }
      } catch { /* câmera já parada */ }
      started = false;
    };

    // espera o conteúdo do diálogo entrar no DOM
    const t = setTimeout(start, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
      void stop();
    };
  }, [open, elementId]);

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    onDetected(code);
    setManual("");
    if (!continuous) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div id={elementId} className="min-h-[200px] overflow-hidden rounded-lg bg-muted" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Keyboard className="h-3 w-3" /> Ou digite / use um leitor de código de barras:
          </p>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitManual(); } }}
              placeholder="IMEI, serial ou código"
              inputMode="text"
            />
            <Button type="button" variant="outline" onClick={submitManual}>Usar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
