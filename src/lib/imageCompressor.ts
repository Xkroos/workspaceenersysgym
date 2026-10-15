/**
 * Utilidad de compresión y optimización de imágenes en el cliente (navegador).
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
  originalSize: number;
  compressedSize: number;
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
        // Si no se puede decodificar en Canvas, devolver dataUrl original como respaldo seguro
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
              originalSize,
              compressedSize
            });
          } else {
            resolve({
              dataUrl: rawDataUrl,
              originalSize,
              compressedSize: originalSize
            });
          }
        } catch {
          // Si ocurre cualquier error en canvas, usar rawDataUrl como fallback 100% confiable
          resolve({
            dataUrl: rawDataUrl,
            originalSize,
            compressedSize: originalSize
          });
        }
      };

      img.src = rawDataUrl;
    };

    reader.readAsDataURL(file);
  });
}
