import type { TranscodeEncoding } from "node:buffer";
import { URLSearchParams } from "node:url";
import * as multipart from "parse-multipart-data";
import { File, Request, Response } from "./fetch.js";

/**
 * Handle HTML forms: multipart/form-data and application/x-www-form-urlencoded,
 *
 * Form data is name/value pairs. If a name appears multiple times in the form,
 * the value is an array.
 *
 * Regular forms only support strings. Multipart forms can contain files as well.
 *
 * @param request The HTTP request
 * @returns Form data
 */
export default async function form<
  T extends {
    [key: string]: string | File | (string | File)[];
  }
>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type");
  const { mime, encoding } = parseContentType(contentType);
  const input = Buffer.from(await request.arrayBuffer());

  if (mime === "multipart/form-data") {
    const boundary = contentType?.match(/;\s*boundary=([^;]+)/)?.[1];
    if (!boundary) throw new Error("multipart/form-data: missing boundary");

    const fields = multipart.parse(input, boundary);
    return combine(fields) as T;
  } else if (mime === "application/x-www-form-urlencoded") {
    const fields = new URLSearchParams(input.toString(encoding ?? "utf-8"));
    return combine(
      Array.from(fields.keys())
        .map((name) => fields.getAll(name).map((data) => ({ name, data })))
        .flat()
    ) as T;
  } else throw new Response("Unsupported Media Type", { status: 415 });
}

function combine(
  fields: Array<{
    contentType?: string;
    data: Buffer | string;
    filename?: string;
    name?: string;
  }>
): { [key: string]: string | File | (string | File)[] } {
  return fields.reduce((all, field, index) => {
    const name = field.name ?? index.toString();
    const value = formField(field);
    if (name in all) {
      const existing = all[name];
      if (Array.isArray(existing)) existing.push(value);
      else all[name] = [existing, value] as (string | File)[];
    } else all[name] = value;
    return all;
  }, {} as { [key: string]: string | File | (string | File)[] });
}

function parseContentType(contentType?: string | null): {
  mime: string | undefined;
  encoding: TranscodeEncoding | undefined;
} {
  const mime = contentType?.split(";")[0];
  const encoding = contentType?.match(/;\s*charset=([^;]+)/)?.[1] as
    | TranscodeEncoding
    | undefined;
  return { mime, encoding };
}

function formField({
  contentType,
  data,
  filename,
}: {
  contentType?: string;
  data: Buffer | string;
  filename?: string;
}): string | File {
  if (Buffer.isBuffer(data) && filename) {
    return new File([data], filename, {
      type: contentType ?? "application/octet-stream",
    });
  } else {
    const { encoding } = parseContentType(contentType);
    return data.toString(encoding ?? "utf-8");
  }
}
