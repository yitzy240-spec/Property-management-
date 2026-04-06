const id = 'c91b79c7-c032-4157-a125-16104f69c550'
const secret = '{9y1z5+]5|jJvcO00WPo(3k#*:hQ$WGj'

async function main() {
  const r = await fetch('https://sandbox.d.greeninvoice.co.il/api/v1/account/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, secret })
  })
  console.log('Status:', r.status)
  const text = await r.text()
  console.log('Response:', text.substring(0, 200))
}
main()
