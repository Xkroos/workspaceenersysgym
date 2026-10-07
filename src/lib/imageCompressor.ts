/**
 * Utilidad de compresión y optimización de imágenes en el cliente (navegador).
 * Reduce imágenes de hasta 10MB a menos de ~60-80KB en milisegundos usando Canvas HTML5,
 * evitando saturar el ancho de banda y la base de datos de Supabase.
 */

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0 a 1
  mimeType?: 'image/jpeg' | 'image/webp';
}

export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<{ dataUrl: string; file: File; originalSize: number; compressedSize: number }> {
  const {
    maxWidth = 1000,
    maxHeight = 1000,
    quality = 0.75,
    mimeType = 'image/jpeg'
  } = options;

  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen'));

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Error al decodificar la imagen'));

      img.onload = () => {
        let width = img.width;
        let height = img.height;

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
          reject(new Error('No se pudo inicializar el contexto 2D del Canvas'));
          return;
        }

        // Suavizado de imagen de alta calidad
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Dibujar en el canvas redimensionado
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a DataURL optimizado
        const dataUrl = canvas.toDataURL(mimeType, quality);

        // Convertir también a Blob / File para APIs que requieran File
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Fallo al comprimir imagen en Blob'));
              return;
            }

            const fileName = (file instanceof File ? file.name : 'image')
              .replace(/\.[^/.]+$/, "") + (mimeType === 'image/webp' ? '.webp' : '.jpg');

            const compressedFile = new File([blob], fileName, {
              type: mimeType,
              lastModified: Date.now(),
            });

            resolve({
              dataUrl,
              file: compressedFile,
              originalSize,
              compressedSize: blob.size
            });
          },
          mimeType,
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
