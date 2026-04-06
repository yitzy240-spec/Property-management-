const id = 'c91b79c7-c032-4157-a125-16104f69c550'
const secret = '{9y1z5+]5|jJvcO00WPo(3k#*:hQ$WGj'
const BASE = 'https://sandbox.d.greeninvoice.co.il/api/v1'

async function main() {
  const tokenRes = await fetch(BASE + '/account/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, secret })
  })
  const { token } = await tokenRes.json()

  async function gi(path, body) {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const text = await r.text()
    console.log(path + ':', r.status)
    console.log(text.substring(0, 500))
    console.log()
    return { status: r.status, data: JSON.parse(text) }
  }

  // Try different payment form structures
  console.log('=== Test 1: with income array ===')
  await gi('/payments/form', {
    type: 320,
    lang: 'he',
    currency: 'ILS',
    client: { name: 'Test Owner', emails: ['test@test.com'] },
    income: [{ description: 'Monthly management', quantity: 1, price: 500, currency: 'ILS', vatType: 0 }],
  })

  console.log('=== Test 2: with amount field ===')
  await gi('/payments/form', {
    type: 320,
    lang: 'he',
    currency: 'ILS',
    amount: 500,
    client: { name: 'Test Owner', emails: ['test@test.com'] },
    income: [{ description: 'Monthly management', quantity: 1, price: 500, currency: 'ILS', vatType: 0 }],
  })

  console.log('=== Test 3: pluginId style ===')
  await gi('/payments/form', {
    pluginId: 'test',
    type: 320,
    currency: 'ILS',
    maxPayments: 1,
    group: 1000,
    client: { name: 'Test Owner', emails: ['test@test.com'] },
    income: [{ catalogNum: '', description: 'Monthly management', quantity: 1, price: 500, currency: 'ILS', vatType: 0 }],
  })

  // Also try creating a document first, then getting payment link
  console.log('=== Test 4: create doc then get payment URL ===')
  const docRes = await gi('/documents', {
    type: 300, // proforma
    lang: 'he',
    currency: 'ILS',
    client: { name: 'Test Owner', emails: ['test@test.com'], add: true },
    income: [{ description: 'Monthly management', quantity: 1, price: 500, currency: 'ILS', vatType: 0 }],
    payment: [{ date: '2026-04-06', type: -1, price: 500, currency: 'ILS' }],
  })

  if (docRes.status === 200 && docRes.data.id) {
    console.log('Document created:', docRes.data.id)
    // Try to get payment URL for this document
    const payRes = await fetch(BASE + '/documents/' + docRes.data.id + '/payment', {
      headers: { Authorization: 'Bearer ' + token }
    })
    console.log('Payment URL status:', payRes.status)
    const payText = await payRes.text()
    console.log(payText.substring(0, 300))
  }
}
main().catch(e => console.error(e.message))
