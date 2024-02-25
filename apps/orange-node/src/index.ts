import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ALGOD_TOKEN, ALGOD_URL } from "./config";

const app = express();

// TODO: replace with scheme to verify requests come from orange gateways
const isAccessAllowed = (req: express.Request) => {
  // Reads x-api-key as Orange API key first
  // Will be replaced with local algod's api-key  
  // return req.headers["x-api-key"] === "testing";
  return true;
};

// Custom middleware to intercept all calls
app.use((req, res, next) => {
  if (!isAccessAllowed(req)) {
    res.status(403).send("Forbidden");
  } else {
    // remove API key from request
    delete req.headers["x-api-key"];
    // console.log(`Incoming request for ${req.url}`);
    // console.log(`headers: ${JSON.stringify(req.headers)}`);
    next(); // Proceed to the next middleware/route handler
  }
});

// default to A1CN node
app.get("/orange", (req, res) => res.send("Hello Orange API"));

/* Fall back to proxying requests to algod */
app.use(
  "/",
  createProxyMiddleware({
    target: ALGOD_URL,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
      // console.log("Headers: " + JSON.stringify(req.headers));
      // console.log(req.method)

      if (req.method == "POST") {
        // TODO: send txid to tracker for point earning
      }

      proxyReq.setHeader("x-api-key", ALGOD_TOKEN!);
    },
  })
);

// Start the server

if (ALGOD_TOKEN && ALGOD_URL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
} else {
  console.error(`Unable to read data from algod to start server. Check env value for ALGORAND_DATA points to 
  your algod's data directory.`);
  process.exit(1);
}
