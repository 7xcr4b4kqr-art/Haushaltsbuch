export function resizeAvatarImage(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Bitte eine gültige Bilddatei (JPG, PNG, WebP) auswählen.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Die Bilddatei konnte nicht gelesen werden.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Das Bildformat wird vom Browser nicht unterstützt.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas-Kontext nicht verfügbar.'));
          return;
        }

        // Fill neutral warm background in case source image has transparency
        ctx.fillStyle = '#FCFBF8';
        ctx.fillRect(0, 0, size, size);

        // Center-crop square
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
