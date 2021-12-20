import { Request, Response } from "node-fetch";
import invariant from "tiny-invariant";
import { URLSearchParams } from "url";
import { RequestHandler } from "../types/handlers";
import { Route } from "./loadServices";
import { PushMessageFunction } from "./pushMessage";

declare var global: {
  pushMessage: PushMessageFunction;
};

export default async function queueRequestHandlerFor(
  route: Route,
  request: Request,
  { params, user }: Parameters<RequestHandler>[1]
) {
  invariant(route.queue, "Route must have a queue");
  const { isFifo, queueName } = route.queue;
  if (isFifo && !params.group)
    throw new Response("Missing group parameter", { status: 400 });

  const messageId = await global.pushMessage({
    body: await getMessageBody(request),
    ...(isFifo
      ? {
          dedupeId: params.dedupe,
          groupId: params.group,
        }
      : undefined),
    queueName: queueName,
    params,
    user,
  });
  return { messageId };
}

async function getMessageBody(
  request: Request
): Promise<Buffer | string | object> {
  switch (request.headers.get("Content-Type")) {
    case "application/json": {
      try {
        return await request.json();
      } catch (error) {
        throw new Response("Request body not a valid JSON document", {
          status: 400,
        });
      }
    }
    case "plain/text": {
      const text = await request.text();
      if (!text) throw new Response("No message body", { status: 400 });
      return text;
    }
    case "application/octet-stream": {
      const buffer = await request.buffer();
      if (!buffer.byteLength)
        throw new Response("No message body", { status: 400 });
      return buffer;
    }
    case "application/x-www-form-urlencoded": {
      const text = await request.text();
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    }
    default: {
      throw new Response("Unsupported media type", { status: 406 });
    }
  }
}
