# HTTP/REST

QueueRun makes HTTP APIs as easy as:

* Map URL route like /items/123 to api/items/[id].ts (and back to URL)
* Export a function for each HTTP method you want to handle
* Will parse request documents for you: JSON, HTML forms, text, and binary
* Easy access to path parameters, query string parameters, and cookies
* Generate JSON, XML/HTML, plain text, and binary responses
* Middleware for [authentication](authenticate.md) and [logging](logging.md)
* Handles CORS for you and response caching
* Verify accepted content types and HTTP methods


## Routes and Files

For convenience, the URL structure is mirrored by the file system:

- All API routes are located in the `api` directory
- The filename extension (`js`, `ts`, `tsx`, etc) is not part of the URL
- The filename maps to a URL path, eg `api/orders/recent.ts` => `/orders/recent`
- The `index` gets dropped, eg `api/orders/index.ts` => `/orders`
- Square brackets denote parameters, eg `api/orders/[id].ts` => `/orders/123`
- You can have multiple parameters, eg `api/orders/[orderId]/items/[itemId].ts`
- The last parameter can be a catch-all, eg `api/reports/[...rest].ts` => `/reports/2021/01/usage.ts`
- Paths can contain extensions, eg `/api/feed.xml.ts` or `api/orders.[format].ts`
- Filenames that start with `_` are not part of the API, etc `api/_middleware.ts`

For example:

```bash
$ npx queue-run build

  HTTP API
  ──────────────────────────────────────────
  /                →  api/index.tsx
  /bookmarks       →  api/bookmarks/index.ts
  /bookmarks/:id   →  api/bookmarks/[id].ts
  /bookmarks/feed  →  api/bookmarks/feed.tsx
```


## Request Handlers

Request handlers accept an HTTP request and produce an HTTP response.

They take a single argument with named parameters:

- `body` — The parsed document body (JavaScript object, string, or `Buffer`)
- `cookies` — Object with all cookies included in the request, eg `{ session: "1def…" }`
- `params` — Object with URL path parameters, eg `/orders/123` => `{ order: "123" }` (the catch-all parameter value is an array)
- `query` — Object with query string parameters, eg `{ sort: "desc" }` (the value is an array for any query string parameter that appears more than once)
- `request` - The HTTP [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object
- `requestId` - Unique request ID, used for tracing
- `signal` — The [abort signal](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- `user` — User object returned from the [authenticate](authenticate.md) middleware

They return a single value, which can be one of:

- `any object` — Respond with a JSON document
- `Buffer` — Respond with content type `application/octet-stream`
- `JSX` — Respond with `text/html` or `application/xml` (see [Generating XML](XML))
- `null` — Respond with status code 204 (No Content)
- `string` — Respond with content type `text/plain` (UTF-8 encoded)
- [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) — Any HTTP response you want

The request handler can also throw a `Response` object. This is used to "break from" further processing, eg the [authenticate](authenticate.md) middleware uses this.

If the request handler throws any other error, the server responds with 500. That error is also logged by the [Logging Middleware](logging.md).

If the request times out, the server responds with 500. You can use the abort signal to tell if the request timed out.


## HTTP Methods

You can response to HTTP methods in one of two ways: export a function for each HTTP method, or export  a default request handler.

For example:

```ts
// HTTP GET => JSON document or 404
export async function get({ params }) {
  const item = await db.items.findOne(params.id);
  if (!item) throw new Response(null, { status: 404 });
  return item;
}

// HTTP PUT + JSON => JSON document or 404
export async function put({ body, params }) {
  const item = await db.items.findOne(params.id);
  if (!item) throw new Response(null, { status: 404 });

  return await db.items.update({ id: params.id, ...body });
}

// HTTP DELETE => 204
export async function del({ params }) {
  await db.items.remove(params.id);
  return null;
}
```

This route will only accept methods explicitly exported, and respond with 405 for methods it doesn't understand.

It will support the HEAD method: if you don't export the `head` function, then `get` is used instead.

It will support the OPTIONS method, and the response will include `Access-Control-Allow-Methods` header listing all allowed methods

:::info delete => del
Since `delete` is a reserved keyword in JavaScript, use `del` to export the HTTP DELETE method handler.
:::

To use the default request handler:

```ts
export default async function({ params, request }) {
  switch (request.method) {
    case "GET": {
      const item = await db.findOne(params.id);
      if (!item) throw new Response(null, { status: 400 });
      return item;
    }
    case "PUT": {
      ...
    }
    case "DELETE": {
      ...
    }
    default:
      throw new Response(null, { status: 405 });
  }
}
```

You can also limit which methods are accepted:

```ts
export const config = {
  methods: ["GET", "HEAD", "PUT", "DELETE"]
};
```

:::info OPTIONS
If you want to handle OPTIONS yourself, you need to turn off CORS:

```ts
export const config = {
  cors: false
};
```
:::


## Content Types

The common use case is to accept and respond with JSON documents. This is made easy by parsing the JSON request (available as `body`), and serializing any returned object.

So the common use case is as simple as:

```ts title=api/to_uppercase.ts
export async function post({ body }) {
  const { text } = body;
  return { text: text.toUpperCase() };
}
```

```bash
curl http://localhost:8000/ -d '{ "message": "Hello" }'
=> { "messge": "Hello" }
```

The web has other content types — HTML forms, XML, plain text — and these are all supported.

### Body parsing

QueueRun will parse the request body according to the following rules:

- `application/json` — JSON document to JavaScript object
- `application/x-www-form-urlencoded` - To key/value pairs (more below)
- `multipart/form-data` — To key/value pairs (more below)
- `text/plain` — As a string, UTF-8 encoded
- `application/octet-stream` — `Buffer` with the raw request document
- no content type — JSON document to JavaScript object

For all other content types, you can get the raw byte buffer from the [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) object.

### Responses

Responses are handled in the following way:

- `any object` — The content type is `application/json`
- `Buffer` — The content type is `application/octet-stream`
- `JSX` — The content type is `text/html` or `application/xml`
- `null` — Respond with status code 204 (No Content)
- `string` — The content type is `text/plain` (UTF-8 encoded)
- [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) — Use this as the response

The default status code is 200, except when returning `null` (200).

In development, JSON and XML documents are indented for clarity. You can turn indentation on in production by setting the environment variable `QUEUE_RUN_INDENT`.

The `ETag` is calculated based on the content of the response, but see [Cache Control](#cache-control) to learn how to change that.

For redirects, you can use `return Response.redirect(url, status?);`.

For more complicated use cases, use the `Response` object. For example:

```
export async function get({ params }) {
  const metrics = await db.metricsFor({ date: params.date });
  const csv = generate(metrics, { columns: true });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="data.csv"'
    }
  })
}
```

### x-www-form-urlencoded

```html title=encoded.html
<form method="post">
  <input name="name"/>
  <input name="email" type="email"/>
  <input name="password" type="password"/>
  <button type="submit">Sign Up</button>
</form>
```

```ts title=api/encoded.ts
type Fields = {
  email: string;
  name: string;
  password: string;
};

export aync function post({ body }: { body: Fields }) {
  const { name, email, passowrd } = body;
  const user = await createUser({ name, email, password });
  return Response.redirect(url("/user/[id]", { user }), 303);
}
```

### multipart/form-data

```html title=multipart.html
<form method="post" enctype="multipart/form-data">
  <input type="text" name="name"/>
  <input type="file" name="photo" accepts="image/*">
  <button type="submit">Sign Up</button>
</form>
```

```ts title=api/multipart.ts
import { File } from 'queue-run';
import filesize from 'filesize';

type Fields = {
  name: string;
  photo: File;
}

export aync function post({ body }: { body: Fields }) {
  const { name, photo } = body;
  console.info("Name:  %s", name);
  console.info("Photo: %s type %s size %s", photo.name, photo,type, filesize(photo.size));
  await fs.writeFile(photo.filename, photo);
  return null;
}
```

```
Name:  Assaf Arkin
Photo: avatar.png of type image/png size 1.4 MB
```


## export const config

You can control some aspect of the request handler by exporting the `config` object with the following properties (all optional):

- `accepts` — Accepted content types (default `*/*`)
- `cache` — Add this `Cache-Control` header to the response (string), or cache the response for this many seconds (number) (see [Cache Control](#cache-control))
- `cors` — True if this route supports CORS (default: true)
- `etag` — If true adds `ETag` header based on the content of the response (default: true)
- `methods` — Allowed HTTP methods, only when exporting default request handler (default: `*`)
- `timeout` — Timeout for processing the request, in seconds (default: 10 seconds)

For example:

```ts
export const config =  {
  // This resource only accepts JSON documents
  accepts: "application/json",
  // Cache responses for 5 minutes
  cache: 300,
  // Extend timeout to 60 seconds
  timeout: 60
};
```

## Cache-Control

QueueRun can set the `ETag` and `Cache-Control` header for you. This only kicks in for responses that return a document with status code 200.

To set caching to specific duration:

```ts
export const config =  {
  cache: 300 // = 5 minutes
};
```

To cache based on the response object:

```ts
export async function get({ params }) {
  const task = await db.findOne(params.id);
  if (!task) throw new Response(null, { status: 400 });
  return task;
}

export const config =  {
  // Status of completed task doesn't change, cache for 24 hours
  cache: (task) => task.isCompleted ? 86400 : false,
  etag: (task) => task.version
};
```
