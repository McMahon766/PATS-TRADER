export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let signal = req.body || {};

  // Log what n8n is sending
  console.log("Received signal:", JSON.stringify(signal));

  const required = ['TYPE', 'ENTRY', 'SL', 'TP', 'lots', 'uniqueID'];
  for (const f of required) {
    if (signal[f] === undefined) {
      return res.status(400).json({ error: `Missing field: ${f}` });
    }
  }

  const APP_ID    = process.env.APP_ID;
  const TOKEN     = process.env.TOKEN;
  const MT5_LOGIN = process.env.MT5_LOGIN;

  if (!APP_ID || !TOKEN || !MT5_LOGIN) {
    return res.status(500).json({ error: "Server credentials not configured" });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`);

      let step = 'auth';

      const send = (obj) => ws.send(JSON.stringify(obj));

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Deriv connection timed out'));
      }, 15000);

      ws.on('open', () => {
        console.log("WebSocket connected, authorizing...");
        send({ authorize: TOKEN });
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        console.log("Received from Deriv:", msg.msg_type);

        if (msg.error) {
          clearTimeout(timeout);
          ws.close();
          return reject(new Error(`Deriv Error [${step}]: ${msg.error.message || JSON.stringify(msg.error)}`));
        }

        if (step === 'auth' && msg.msg_type === 'authorize') {
          step = 'trade';
          console.log("Authorized. Sending trade order...");
          send({
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
          });
        }

        if (step === 'trade' && msg.msg_type === 'mt5_new_order') {
          clearTimeout(timeout);
          ws.close();
          resolve({
            success: true,
            order_id: msg.mt5_new_order?.order,
            ...signal,
            timestamp: new Date().toISOString()
          });
        }
      });

      ws.on('error', (err) => {
        console.error("WebSocket error:", err);
        clearTimeout(timeout);
        reject(new Error('WebSocket connection failed'));
      });
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error("Final Error:", err.message);
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
}