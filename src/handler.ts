import { Probot, createProbot } from "probot";
import app from "./index";

export default () => {
  return async (event: any) => {
    const probot: Probot = createProbot();

    probot.load(app);
    return await webhookHandler(probot, event);
  };
};

const webhookHandler = async (probot: Probot, event: any) => {
  try {
    const headersLowerCase = Object.fromEntries(
      Object.entries(event.headers).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ])
    );

    await probot.webhooks.verifyAndReceive({
      id: headersLowerCase["x-github-delivery"] as string,
      name: headersLowerCase["x-github-event"] as any,
      signature:
        (headersLowerCase["x-hub-signature-256"] as string) ||
        (headersLowerCase["x-hub-signature"] as string),
      payload: JSON.parse(event.body),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ result: "ok!" }),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: error.status || 500,
      error: "Ooops, something goes wrong",
    };
  }
};
