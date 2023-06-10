import { createNodeMiddleware, createProbot } from "probot";
import app from "../../src/index";

const probot = createProbot();

export default createNodeMiddleware(app, {
  probot,
  webhooksPath: "/api/webhooks",
});
