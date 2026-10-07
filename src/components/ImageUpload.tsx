import { useState, useRef } from 'react';
import { Upload, X, Loader2, Check } from 'lucide-react';
import { compressImage } from '../lib/imageCompressor';

interface ImageUploadProps {
  onImageSelected: (imageData: string) => void;
  disabled?: boolean;
}

export function ImageUpload({ onImageSelected, disabled = false }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [savingsInfo, setSavingsInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`La imagen debe ser menor a ${maxSizeMB}MB`);
      return;
    }

    try {
      setCompressing(true);
      // Compresión inteligente en cliente: max 1000px, quality 0.75
      const { dataUrl, originalSize, compressedSize } = await compressImage(file, {
        maxWidth: 1000,
        maxHeight: 1000,
        quality: 0.75,
        mimeType: 'image/jpeg'
      });

      const savings = Math.round(((originalSize - compressedSize) / originalSize) * 100);
      setSavingsInfo(savings > 0 ? `Optimizado -${savings}%` : 'Listo');
      setPreview(dataUrl);
      onImageSelected(dataUrl);
    } catch (err: any) {
      console.error("Error al procesar la imagen:", err);
      // Fallback a lectura estándar si canvas fallara
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target?.result as string;
        setPreview(base64String);
        onImageSelected(base64String);
      };
      reader.readAsDataURL(file);
    } finally {
      setCompressing(false);
    }
  };

  const handleClear = () => {
    setPreview(null);
    setSavingsInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onImageSelected('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || compressing}
          className="flex-1 px-4 py-2.5 bg-black border border-zinc-800 rounded-xl hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
        >
          {compressing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
              Optimizando...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 text-orange-500" />
              Subir Imagen
            </>
          )}
        </button>
        {preview && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 bg-red-950/30 border border-red-900/50 text-red-400 rounded-xl hover:bg-red-900/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || compressing}
      />
      {preview && (
        <div className="relative w-full h-40 bg-black rounded-2xl border border-zinc-800 overflow-hidden shadow-inner group">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-full object-contain"
            loading="lazy"
          />
          {savingsInfo && (
            <div className="absolute bottom-2 right-2 px-2.5 py-1 bg-emerald-950/80 backdrop-blur-sm border border-emerald-800/60 rounded-lg text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1 shadow-lg">
              <Check className="w-3 h-3" /> {savingsInfo}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
