const k = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';
fetch('https://ctitnuadeqdwsgulhpjg.supabase.co/rest/v1/quote_items', {
    method: 'POST',
    headers: {
        apikey: k,
        Authorization: 'Bearer ' + k,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    },
    body: JSON.stringify([{quoteId: 'fc8c45ad-dc88-4294-95de-6a9366b8d84f', description: '<IMAGE::>url', quantity: 0, price: 0, itemId: null, manualId: 'IMG-0'}])
})
.then(async r => {
    console.log(r.status);
    console.log(JSON.stringify(await r.json(), null, 2));
});
