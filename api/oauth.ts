import "dotenv/config";
import express from "express";
import { registerOAuthRoutes } from "../../server/_core/oauth";

const app = express();
app.use(express.json());
registerOAuthRoutes(app);

export default app;
