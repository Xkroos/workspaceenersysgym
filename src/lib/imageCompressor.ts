/**
 * Utilidad de compresión y optimización de imágenes en el cliente (navegador).
 * Diseñada para máxima compatibilidad con dispositivos móviles (iOS Safari, Android WebViews, navegadores de escritorio).
 * - Usa URL.createObjectURL para evitar sobrecarga de memoria heap (evita Out-Of-Memory en teléfonos).
 * - Protegida contra fallos de `new File()` en Safari / WebKit.
 * - Todos los callbacks asíncronos están envueltos en try/catch para evitar excepciones no capturadas.
 * - Limita dimensiones y calidad para garantizar comprobantes nítidos de ~40-80KB sin saturar el ancho de banda ni la base de datos.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0 a 1
  mimeType?: 'image/jpeg' | 'image/webp' | 'image/png';
}

export interface CompressionResult {
  dataUrl: string;
  file?: File | Blob;
  blob?: Blob | null;
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

  if (!file || !(file instanceof Blob)) {
    throw new Error('Archivo de imagen no válido');
  }

  const originalSize = file.size;

  // Verificación de formato HEIC no soportado nativamente por canvas
  const fileName = (file instanceof File ? file.name : '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();
  const isHeic = fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif');

  return new Promise((resolve, reject) => {
    let objectUrl: string | null = null;
    let settled = false;

    // Timeout de seguridad: si el navegador se cuelga procesando, no deja la app congelada
    const timeoutId = setTimeout(() => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error('Tiempo de espera agotado al procesar la imagen'));
      }
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignorar fallo al revocar
        }
        objectUrl = null;
      }
    };

    const safeResolve = (res: CompressionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(res);
    };

    const safeReject = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      // Si URL.createObjectURL falla, intentamos FileReader como fallback secundario
      const reader = new FileReader();
      reader.onerror = () => safeReject(new Error('Error al leer el archivo'));
      reader.onload = (e) => {
        processImageSrc(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      return;
    }

    const processImageSrc = (src: string) => {
      const img = new Image();

      img.onerror = () => {
        if (isHeic) {
          safeReject(new Error('El formato HEIC de iPhone no es compatible directamente. Por favor selecciona una foto en JPG o PNG.'));
        } else {
          safeReject(new Error('No se pudo decodificar la imagen seleccionada'));
        }
      };

      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (!width || !height) {
            safeReject(new Error('Dimensiones de imagen inválidas'));
            return;
          }

          // Calcular nuevas dimensiones conservando aspect ratio
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
            safeReject(new Error('No se pudo inicializar el Canvas 2D'));
            return;
          }

          // Suavizado de imagen de alta calidad
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Dibujar en el canvas redimensionado
          ctx.drawImage(img, 0, 0, width, height);

          // Generar DataURL
          let targetMime = mimeType;
          let dataUrl: string;
          try {
            dataUrl = canvas.toDataURL(targetMime, quality);
          } catch {
            targetMime = 'image/jpeg';
            dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          }

          // Estimar tamaño comprimido en bytes a partir del Base64
          const base64Str = dataUrl.split(',')[1] || '';
          const estimatedSize = Math.round((base64Str.length * 3) / 4);

          // Si el navegador soporta toBlob, generamos también el archivo de forma 100% segura
          if (typeof canvas.toBlob === 'function') {
            try {
              canvas.toBlob(
                (blob) => {
                  try {
                    if (!blob) {
                      safeResolve({
                        dataUrl,
                        blob: null,
                        originalSize,
                        compressedSize: estimatedSize
                      });
                      return;
                    }

                    const cleanName = (file instanceof File ? file.name : 'comprobante')
                      .replace(/\.[^/.]+$/, "") + (targetMime === 'image/webp' ? '.webp' : '.jpg');

                    let safeFile: File | Blob = blob;
                    try {
                      // Safari / WebKit puede fallar con new File() -> captura segura
                      safeFile = new File([blob], cleanName, {
                        type: targetMime,
                        lastModified: Date.now(),
                      });
                    } catch {
                      safeFile = blob;
                    }

                    safeResolve({
                      dataUrl,
                      blob,
                      file: safeFile,
                      originalSize,
                      compressedSize: blob.size || estimatedSize
                    });
                  } catch (blobInnerErr) {
                    safeResolve({
                      dataUrl,
                      blob: null,
                      originalSize,
                      compressedSize: estimatedSize
                    });
                  }
                },
                targetMime,
                quality
              );
            } catch {
              safeResolve({
                dataUrl,
                blob: null,
                originalSize,
                compressedSize: estimatedSize
              });
            }
          } else {
            safeResolve({
              dataUrl,
              blob: null,
              originalSize,
              compressedSize: estimatedSize
            });
          }
        } catch (drawErr) {
          safeReject(drawErr);
        }
      };

      img.src = src;
    };

    processImageSrc(objectUrl);
  });
}
