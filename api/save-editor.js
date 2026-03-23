export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const response = await fetch(process.env.EDITOR_SAVE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...req.body,
        secret: process.env.EDITOR_SAVE_SECRET
      })
    });

    const text = await response.text();

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      return res.status(200).json({ ok: false, error: text });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err)
    });
  }
}
