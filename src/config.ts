import { HandlerModule } from "./common";
import StarCreateHandler from "./events/star.created";

export interface Configuration {
  app_name: string;
}

export const Handlers: HandlerModule[] = [StarCreateHandler];

export const AppConfig: Configuration = {
  app_name: process.env.APP_NAME!,
};
