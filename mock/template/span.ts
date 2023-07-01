import opentelemetry, { Span } from "@opentelemetry/api";

const tracer = opentelemetry.trace.getTracer(process.env.APP_NAME || "dae-bot");

const span = async () => {
  await tracer.startActiveSpan(
    "app.handler.star.created.event_logging",
    { attributes: { metadata: "some metadata" } },
    async (span: Span) => {
      span.addEvent("something");
      span.end();
    }
  );
};
