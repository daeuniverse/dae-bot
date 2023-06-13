import { kv } from "@vercel/kv";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const main = async () => {
  await kv.set("ci-bot-experiment.stars", 2);
  const result = await kv.get("ci-bot-experiment.stars");
  console.log(result);
  console.log(typeof result);
};

main();
