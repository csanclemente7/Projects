const k = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';

fetch('https://ctitnuadeqdwsgulhpjg.supabase.co/rest/v1/quote_items?limit=1', {
  headers: {
    apikey: k,
    Authorization: 'Bearer ' + k
  }
})
.then(r => r.json())
.then(console.log);

fetch('https://ctitnuadeqdwsgulhpjg.supabase.co/rest/v1/quote_items', {
    method: 'POST',
    headers: {
        apikey: k,
        Authorization: 'Bearer ' + k,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    },
    body: JSON.stringify([{quoteId: 'a127f8d3-54cd-4e87-a352-7b1897c8808d', description: '<IMAGE::>url', quantity: 0, price: 0, itemId: null, manualId: 'IMG-0'}])
})
.then(r => r.json().then(data => console.log(r.status, data)));
