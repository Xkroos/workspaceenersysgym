import { useState, useRef } from 'react';
import { Upload, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { compressImage } from '../lib/imageCompressor';

interface ImageUploadProps {
  onImageSelected: (imageData: string) => void;
  disabled?: boolean;
}

export function ImageUpload({ onImageSelected, disabled = false }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [savingsInfo, setSavingsInfo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setErrorMessage(`La imagen supera el límite de ${maxSizeMB}MB`);
      return;
    }

    try {
      setCompressing(true);
      const { dataUrl, originalSize, compressedSize } = await compressImage(file, {
        maxWidth: 900,
        maxHeight: 900,
        quality: 0.75,
        mimeType: 'image/jpeg'
      });

      if (!dataUrl) {
        setErrorMessage("No se pudo leer la imagen seleccionada. Intenta con otra foto.");
        return;
      }

      const savings = originalSize > compressedSize 
        ? Math.round(((originalSize - compressedSize) / originalSize) * 100) 
        : 0;
      setSavingsInfo(savings > 0 ? `Optimizado -${savings}%` : 'Listo');
      setPreview(dataUrl);
      onImageSelected(dataUrl);
    } catch (err: any) {
      console.error("Error al procesar la imagen:", err);
      setErrorMessage("No se pudo procesar la imagen. Intenta con otra foto.");
      setPreview(null);
      setSavingsInfo(null);
      onImageSelected('');
    } finally {
      setCompressing(false);
    }
  };

  const handleClear = () => {
    setPreview(null);
    setSavingsInfo(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onImageSelected('');
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            fileInputRef.current?.click();
          }}
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
              {preview ? 'Cambiar Imagen' : 'Subir Imagen'}
            </>
          )}
        </button>
        {preview && (
          <button
            type="button"
            onClick={handleClear}
            title="Eliminar comprobante"
            className="px-3 py-2 bg-red-950/30 border border-red-900/50 text-red-400 rounded-xl hover:bg-red-900/50 hover:text-white transition-colors flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-xl text-red-400 text-[11px] font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg,image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || compressing}
      />

      {preview && (
        <div className="relative w-full h-40 bg-black rounded-2xl border border-zinc-800 overflow-hidden shadow-inner group">
          <img
            src={preview}
            alt="Comprobante"
            className="w-full h-full object-contain"
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
