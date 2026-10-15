/**
 * Utilidad de compresión y optimización de imágenes en el cliente (navegador).
 * Soporta cualquier tipo de foto: JPG, JPEG, PNG, WEBP, GIF, SVG, BMP y HEIC (iPhone).
 * Diseñada para máxima compatibilidad, estabilidad y velocidad.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0 a 1
  mimeType?: 'image/jpeg' | 'image/webp' | 'image/png';
}

export interface CompressionResult {
  dataUrl: string;
  blob?: Blob;
  originalSize: number;
  compressedSize: number;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(parts[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch {
    return new Blob([], { type: 'image/jpeg' });
  }
}

export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1000,
    maxHeight = 1000,
    quality = 0.75,
    mimeType = 'image/jpeg'
  } = options;

  if (!file) {
    throw new Error('Archivo de imagen no proporcionado');
  }

  const originalSize = file.size || 0;

  // Detección y conversión automática de formato HEIC/HEIF de Apple iPhone
  let processedBlob: Blob = file;
  const isHeic = file.type.includes('heic') || 
                 file.type.includes('heif') || 
                 (file instanceof File && (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')));

  if (isHeic) {
    try {
      const heic2anyModule = await import('heic2any');
      const heic2any = heic2anyModule.default || heic2anyModule;
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8
      });
      processedBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch (e) {
      console.warn("Aviso: No se pudo convertir HEIC con heic2any, se continuará con lectura directa:", e);
    }
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => {
      resolve({ dataUrl: '', originalSize, compressedSize: 0 });
    };

    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        resolve({ dataUrl: '', originalSize, compressedSize: 0 });
        return;
      }

      const img = new Image();

      img.onerror = () => {
        // Si no se puede decodificar en Canvas (ej. SVG o formato raw), devolver dataUrl original como respaldo seguro
        resolve({
          dataUrl: rawDataUrl,
          originalSize,
          compressedSize: originalSize
        });
      };

      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (!width || !height) {
            resolve({ dataUrl: rawDataUrl, originalSize, compressedSize: originalSize });
            return;
          }

          // Escalar manteniendo proporción
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ dataUrl: rawDataUrl, originalSize, compressedSize: originalSize });
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          let compressedDataUrl: string;
          try {
            compressedDataUrl = canvas.toDataURL(mimeType, quality);
          } catch {
            compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          }

          if (compressedDataUrl && compressedDataUrl.length > 50) {
            const base64Str = compressedDataUrl.split(',')[1] || '';
            const compressedSize = Math.round((base64Str.length * 3) / 4);

            resolve({
              dataUrl: compressedDataUrl,
              blob: dataUrlToBlob(compressedDataUrl),
              originalSize,
              compressedSize
            });
          } else {
            resolve({
              dataUrl: rawDataUrl,
              blob: dataUrlToBlob(rawDataUrl),
              originalSize,
              compressedSize: originalSize
            });
          }
        } catch {
          // Si ocurre cualquier error en canvas, usar rawDataUrl como fallback 100% confiable
          resolve({
            dataUrl: rawDataUrl,
            blob: dataUrlToBlob(rawDataUrl),
            originalSize,
            compressedSize: originalSize
          });
        }
      };

      img.src = rawDataUrl;
    };

    reader.readAsDataURL(processedBlob);
  });
}
