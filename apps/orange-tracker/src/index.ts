import express from "express";

const app = express();

// default to A1CN node
const ALGOD_URL = process.env.ALGOD_URL || "http://localhost:4160";

/* ROUTES */
app.use(
  "/",
  (req, res) => {
    res.send('TBD');
  }
);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
