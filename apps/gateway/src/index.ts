import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import servers from "./nodes.json";

const app = express();

const selectNode = () => {
  const index = Math.floor(Math.random() * servers.length);
  console.log("Selected node: ", servers[index].name, servers[index].url);
  return servers[index].url;
};

/* ROUTES */
app.use("/", (req, res, next) => {
  createProxyMiddleware({
    target: selectNode(),
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
      // TODO: replace with scheme to verify requests come for orange gateways
      proxyReq.setHeader("x-orange-server","testing");
    },
  })(req, res, next);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
