export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const upstreamResponse = await fetch(process.env.EDITOR_SAVE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...req.body,
        secret: process.env.EDITOR_SAVE_SECRET
      })
    });

    const text = await upstreamResponse.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: false, error: text || "Invalid upstream response" };
    }

    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err)
    });
  }
}
