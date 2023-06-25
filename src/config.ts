import { HandlerModule } from "./common";
import StarCreateHandler from "./events/star.created";
import PullRequestOpenHandler from "./events/pull_request.opened";

export interface Configuration {
  app_name: string;
}

export const Handlers: HandlerModule[] = [
  StarCreateHandler,
  PullRequestOpenHandler,
];

export const AppConfig: Configuration = {
  app_name: process.env.APP_NAME!,
};
