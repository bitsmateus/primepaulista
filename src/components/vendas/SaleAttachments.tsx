import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, Trash2, ExternalLink } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function SaleAttachments({ saleId }: { saleId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments = [] } = useQuery({
    queryKey: ["saleAttachments", saleId],
    queryFn: () => api.listSaleAttachments(saleId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["saleAttachments", saleId] });

  const delMut = useMutation({
    mutationFn: (attId: string) => api.deleteSaleAttachment(saleId, attId),
    onSuccess: invalidate,
  });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      await api.uploadSaleAttachment(saleId, file);
      invalidate();
      toast.success("Nota fiscal anexada!");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Falha ao anexar arquivo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <Button variant="outline" size="sm" className="gap-2" disabled={uploading} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" /> {uploading ? "Enviando..." : "Anexar nota fiscal"}
      </Button>

      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{a.filename}</span>
              <a href={a.url} target="_blank" rel="noopener noreferrer" title="Abrir/baixar">
                <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </a>
              <button onClick={() => delMut.mutate(a.id)} title="Remover">
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
