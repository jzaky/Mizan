// netlify/functions/result.js
// The page asks this every few seconds until the reading is ready.

import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ status: "error", error: "No reading id was given." }, 400);

  try {
    const store = getStore("readings");
    const rec = await store.get(id, { type: "json" });
    if (!rec) return json({ status: "pending" });
    return json(rec);
  } catch (e) {
    return json({ status: "error", error: String(e.message || e) }, 500);
  }
};
