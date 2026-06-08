import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function DevicePhotos({ deviceId }: { deviceId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["devicePhotos", deviceId],
    queryFn: () => api.listDevicePhotos(deviceId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["devicePhotos", deviceId] });

  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadDevicePhoto(deviceId, file),
    onSuccess: () => {
      invalidate();
      toast.success("Foto enviada!");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao enviar a foto."),
  });
  const deleteMut = useMutation({
    mutationFn: (photoId: string) => api.deleteDevicePhoto(deviceId, photoId),
    onSuccess: invalidate,
  });

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => uploadMut.mutate(f));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Fotos do aparelho</span>
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="gap-1"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMut.isPending}
        >
          {uploadMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          Adicionar
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma foto.</p>}
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                <img src={p.url} alt="Foto do aparelho" className="h-20 w-20 rounded-md border object-cover" />
              </a>
              <button
                type="button"
                onClick={() => deleteMut.mutate(p.id)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                title="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
