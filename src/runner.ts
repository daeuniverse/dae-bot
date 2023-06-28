import { Span } from "@opentelemetry/api";
import { Repository, Result } from "./common";
import { Handlers } from "./config";
import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";
import { tracer } from "./trace";

export default async (context: Context<any>, app: Probot, event: string) => {
  return tracer.startActiveSpan(
    "app.handler.run",
    async (span: Span): Promise<Result> => {
      const module = Handlers.filter((item) => item.config_key == event)[0];
      const extension = {
        octokit: context.octokit,
        tg: new TelegramClient(),
      };
      const repo: Repository = {
        name: context.payload.repository.name,
        owner: context.payload.organization?.login as string,
      };

      span.setAttributes({ repo: JSON.stringify(repo) });
      const result = await module.handler(context, app, repo, extension);
      span.end();
      return result;
    }
  );
};
