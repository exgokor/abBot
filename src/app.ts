import express from "express";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ⭐ 기본 GET 테스트 엔드포인트 추가
app.get("/", (_req, res) => {
  res.send("Success Test");
});

// Routes
app.use(routes);

// Error handling
app.use(errorHandler);

export default app;
