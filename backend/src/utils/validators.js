/**
 * Ekstraksi pesan error dari Zod safeParse result
 * Kompatibel dengan Zod 3 (error.errors) dan Zod 4 (error.issues)
 */
function getZodErrorMessage(error, defaultMsg = 'Input data tidak valid') {
  if (!error) return defaultMsg
  if (Array.isArray(error.issues) && error.issues.length > 0) {
    return error.issues[0].message || defaultMsg
  }
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors[0].message || defaultMsg
  }
  return error.message || defaultMsg
}

module.exports = {
  getZodErrorMessage,
}
