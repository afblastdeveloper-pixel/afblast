/**
 * Validasi Magic Bytes gambar: JPG, PNG, WEBP, maks 5 MB
 * @param {Buffer} buffer
 * @param {number} [maxSizeBytes=5242880] 5 MB
 * @returns {{ valid: boolean, format: string|null, error: string|null }}
 */
function validateImageMagicBytes(buffer, maxSizeBytes = 5 * 1024 * 1024) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, format: null, error: 'Data gambar tidak valid atau kosong' }
  }

  if (buffer.length > maxSizeBytes) {
    return { valid: false, format: null, error: 'Ukuran file gambar melebihi batas maksimum 5 MB' }
  }

  if (buffer.length < 12) {
    return { valid: false, format: null, error: 'File gambar rusak atau terlalu pendek' }
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'jpg', error: null }
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: 'png', error: null }
  }

  // 3. WEBP: RIFF (bytes 0-3: 52 49 46 46) and WEBP (bytes 8-11: 57 45 42 50)
  const isRiff =
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
  const isWebp =
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50

  if (isRiff && isWebp) {
    return { valid: true, format: 'webp', error: null }
  }

  return {
    valid: false,
    format: null,
    error: 'Format file tidak didukung. Hanya gambar JPEG, PNG, atau WebP yang diperbolehkan.',
  }
}

module.exports = {
  validateImageMagicBytes,
}
