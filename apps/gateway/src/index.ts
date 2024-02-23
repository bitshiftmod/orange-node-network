import express from "express";
import WebSocket from 'ws';

const app = express();

// interface OrangeNode  {
//   name: string;
//   ws: WebSocket;
// }
const connectedNodes:Array<WebSocket> = [];

const selectNode = () => {
  const index = Math.floor(Math.random() * connectedNodes.length);
  const node = connectedNodes[index]
  console.log("Selected node " + index);
  return node;
};

/* ROUTES */
app.get("*", (req, res) => {
  if(connectedNodes.length > 0) {
    const node = selectNode();
    node.send(JSON.stringify({
      headers: req.headers,
      query: req.query,
      params: req.params,
      body: req.body
    }));
  }
  res.send("Hello World");
});

// Start the server
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const WS_PORT = Number(process.env.WS_PORT || 3001);
const wss = new WebSocket.Server({port: WS_PORT});
wss.on('connection', (ws) => {
  console.log('New connection');
  const entry = ws;
  connectedNodes.push(ws);
  ws.on('close', () => {
    console.log('Connection closed');
    connectedNodes.splice(connectedNodes.indexOf(ws), 1);
  });
});