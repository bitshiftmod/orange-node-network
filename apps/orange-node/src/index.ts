import WebSocket from "ws";

// import express from "express";
// import { createProxyMiddleware } from "http-proxy-middleware";

// const app = express();

// // TODO: replace with scheme to verify requests come from orange gateways
// const isAccessAllowed = (req:express.Request) => {
//   return req.headers["x-orange-server"] === "testing";
// }

// // Custom middleware to intercept all calls
// app.use((req, res, next) => {
//   if (!isAccessAllowed(req)) {
//     res.status(403).send("Forbidden");
//   } else {
//     // remove API key from request
//     delete req.headers["x-orange-server"];
//     // console.log(`Incoming request for ${req.url}`);
//     // console.log(`headers: ${JSON.stringify(req.headers)}`);
//     next(); // Proceed to the next middleware/route handler
//   }
// });

// // default to A1CN node
// const ALGOD_URL = process.env.ALGOD_URL || "http://localhost:4160";

// /* ROUTES */
// app.use(
//   "/",
//   createProxyMiddleware({
//     target: ALGOD_URL,
//     changeOrigin: true,
//     // onProxyReq: (proxyReq, req, res) => {
//     //   console.log("Headers: " + JSON.stringify(req.headers));
//     // }
//   })
// );

// // Start the server
// const PORT = process.env.PORT || 3001;
// app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));


const ws = new WebSocket("ws://localhost:3001");

ws.on("open", () => {
  ws.on("message", (data) => {
    const req = JSON.parse(data.toString());
    console.log("Data received: ", JSON.stringify(req));
  });
});