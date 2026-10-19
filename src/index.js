// Telegram webhook -> download audio -> PUT to Navidrome library via WebDAV.

export default {
  async fetch(req, env) {
    if (req.method !== "POST" || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    // Inline bots post a placeholder first and edit the audio in later, so accept edits too.
    const update = await req.json();
    const msg = update.message ?? update.edited_message;
    if (!msg || String(msg.from?.id) !== String(env.ALLOWED_USER_ID)) return new Response("ok");

    const file = msg.audio ?? (msg.document?.mime_type?.startsWith("audio/") ? msg.document : null);
    if (!file) return msg.via_bot ? new Response("ok") : reply(msg, "Send me an audio file.");

    try {
      return reply(msg, `✅ Added: ${await upload(env, file)}`);
    } catch (e) {
      return reply(msg, `❌ ${e.message}`);
    }
  },
};

async function upload(env, file) {
  const meta = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${file.file_id}`).then((r) => r.json());
  if (!meta.ok) throw new Error(`Telegram: ${meta.description}`); // e.g. "file is too big" (>20 MB)

  const src = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${meta.result.file_path}`);
  if (!src.ok) throw new Error(`Download failed: ${src.status}`);

  const name = fileName(file, meta.result.file_path);
  const dst = await fetch(`${env.WEBDAV_URL.replace(/\/$/, "")}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { Authorization: `Basic ${btoa(`${env.WEBDAV_USER}:${env.WEBDAV_PASS}`)}` },
    body: src.body, // streamed, never buffered in the Worker
  });
  if (!dst.ok) throw new Error(`Upload failed: ${dst.status} ${await dst.text()}`);
  return name;
}

function fileName(file, path) {
  const ext = path.match(/\.\w+$/)?.[0] ?? ".mp3";
  const base = file.file_name ?? ([file.performer, file.title].filter(Boolean).join(" - ") || file.file_unique_id);
  const clean = base.replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+/, "").trim().slice(0, 200);
  return /\.\w{2,5}$/.test(clean) ? clean : clean + ext;
}

function reply(msg, text) {
  // Answer directly in the webhook response — no extra API call needed.
  return Response.json({ method: "sendMessage", chat_id: msg.chat.id, text, reply_parameters: { message_id: msg.message_id } });
}
