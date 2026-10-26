const crypto = require('crypto')

/**
 * Mengirim event webhook bertanda HMAC-SHA256 ke backend AF Blast
 * @param {string} event - Nama event (device.connected, message.sent, dll)
 * @param {Object} payload - Data event
 * @param {string} secret - Kunci rahasia HMAC (SIM_WEBHOOK_SECRET)
 * @param {string} backendUrl - URL dasar backend AF Blast
 */
async function sendWebhook(event, payload, secret, backendUrl) {
  const timestamp = Date.now().toString()
  const fullPayload = {
    event,
    ...payload,
  }
  const payloadString = JSON.stringify(fullPayload)
  const dataToSign = `${timestamp}.${payloadString}`
  const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex')

  const targetUrl = `${backendUrl.replace(/\/$/, '')}/api/webhooks/watsap`

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Watsap-Signature': signature,
        'X-Watsap-Timestamp': timestamp,
      },
      body: payloadString,
      signal: AbortSignal.timeout(5000),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.warn(`[Webhook] Backend mengembalikan status ${response.status} untuk event '${event}':`, body)
    } else {
      console.log(`[Webhook] Sukses kirim event '${event}' ke backend (${response.status})`)
    }

    return {
      success: response.ok,
      status: response.status,
      body,
    }
  } catch (err) {
    console.warn(`[Webhook] Gagal menghubungi backend di ${targetUrl} untuk event '${event}':`, err.message)
    return {
      success: false,
      error: err.message,
    }
  }
}

module.exports = {
  sendWebhook,
}
