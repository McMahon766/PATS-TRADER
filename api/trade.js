export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let signal;
  try {
    signal = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    signal = {};
  }

  console.log("Received:", JSON.stringify(signal));

  const required = ['TYPE', 'ENTRY', 'SL', 'TP', 'lots', 'uniqueID'];
  for (const f of required) {
    if (signal[f] === undefined) {
      return res.status(400).json({ error: `Missing field: ${f}` });
    }
  }

  const APP_ID = process.env.APP_ID;
  const TOKEN = process.env.TOKEN;
  const MT5_LOGIN = process.env.MT5_LOGIN;

  if (!APP_ID || !TOKEN || !MT5_LOGIN) {
    return res.status(500).json({ error: "Credentials not set" });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`);

      const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);

      ws.on('open', () => {
        console.log("✅ Connected - Sending authorize");
        ws.send(JSON.stringify({ authorize: TOKEN }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        console.log("Deriv msg:", msg.msg_type || msg);

        if (msg.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Deriv: ${msg.error.message || JSON.stringify(msg.error)}`));
        }

        if (msg.msg_type === 'authorize') {
          console.log("✅ Authorized - Sending order");
          ws.send(JSON.stringify({
            mt5_new_order: 1,
            login: MT5_LOGIN,
            symbol: 'XAUUSD',
            volume: parseFloat(signal.lots),
            type: signal.TYPE === 'BUY' ? 0 : 1,
            price: parseFloat(signal.ENTRY),
            sl: parseFloat(signal.SL),
            tp: parseFloat(signal.TP),
            type_filling: 0,
            type_time: 0,
            comment: `PATS-${signal.uniqueID}`
          }));
        }

        if (msg.msg_type === 'mt5_new_order') {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: true, order: msg.mt5_new_order, signal });
        }
      });

      ws.on('error', (err) => {
        console.error("WebSocket Error:", err.message || err);
        reject(new Error(`WebSocket Error: ${err.message || 'Unknown'}`));
      });

      ws.on('close', () => console.log("WebSocket closed"));
    });

    return res.json(result);

  } catch (err) {
    console.error("Final Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}