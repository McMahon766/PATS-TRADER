export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const APP_ID = process.env.APP_ID;
  const TOKEN = process.env.TOKEN;
  const MT5_LOGIN = process.env.MT5_LOGIN;

  if (!APP_ID || !TOKEN) {
    return res.status(500).json({ error: "APP_ID or TOKEN not configured" });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 10000);

      ws.on('open', () => {
        ws.send(JSON.stringify({ authorize: TOKEN }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        console.log("Deriv Response:", msg);

        ws.close();
        clearTimeout(timeout);

        if (msg.error) {
          reject(new Error(`Auth Failed: ${msg.error.message || JSON.stringify(msg.error)}`));
        } else if (msg.msg_type === 'authorize') {
          resolve({ 
            success: true, 
            message: "✅ Authorization Successful", 
            login_id: msg.authorize,
            mt5_login: MT5_LOGIN 
          });
        }
      });

      ws.on('error', (err) => reject(new Error(`WebSocket Error: ${err.message}`)));
    });

    return res.json(result);

  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}