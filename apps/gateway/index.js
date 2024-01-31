const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const servers = require("./nodes.json");

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
    // onProxyReq: (proxyReq, req, res) => {
    // },
  })(req, res, next);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
