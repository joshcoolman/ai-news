import { NextResponse } from "next/server";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export type Ctx = { params: Promise<{ id: string }> };

export async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}
