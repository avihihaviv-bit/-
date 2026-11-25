/* AI Personal Coach endpoint (Vercel serverless function).
   The Anthropic API key lives ONLY in the Vercel environment variable ANTHROPIC_API_KEY.
   It is never sent to the browser. Without the key this endpoint answers 503 "not_configured"
   and the app shows the coach as "not connected" instead of pretending. */
const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.default || sdk;

const MAX_BODY_CHARS = 24000;
const MODES = {
  analyze: 'נתח את ההתקדמות שלי, זהה הרגלים שאני לא מתמיד בהם ותן 3 שיפורים קונקרטיים.',
  plan_day: 'עזור לי לתכנן את היום: סדר עדיפויות, חלוקת זמן ריאלית בין המשימות והשגרה, וזיהוי עומס יתר.',
  plan_week: 'צור לי תוכנית שבועית מאוזנת לפי המשימות, המטרות וההרגלים שלי.',
  summary: 'סכם את הביצועים שלי בשבוע האחרון בקצרה: מה הלך טוב, מה פחות, ומה הצעד הבא.',
  workout: 'נתח את האימונים שלי (תדירות, נפח, התקדמות בתרגילים, איזון בין קבוצות שריר) ותן 3 המלצות קונקרטיות לשבוע הבא.',
  nutrition: 'נתח את התזונה והשתייה שלי בימים האחרונים מול היעדים, ותן 3 שיפורים פשוטים ומעשיים. בלי דיאטות ובלי ספירת קלוריות.',
  chat: ''
};

const SYSTEM = [
  'אתה מאמן אישי לפרודוקטיביות ולהרגלים בתוך אפליקציה בשם "מסלול".',
  'ענה תמיד בעברית, בגוף שני, בטון חם, ישיר ומעשי. בלי הטפות.',
  'התבסס רק על הנתונים שקיבלת בהודעה. אם חסר מידע - אמור זאת במפורש ואל תמציא מספרים.',
  'תן המלצות קונקרטיות עם שעות ומשימות אמיתיות מהנתונים. העדף מעט צעדים ברורים על פני רשימות ארוכות.',
  'מבנה: כותרות קצרות ותבליטים. עד כ-250 מילים, אלא אם התבקשה תוכנית שבועית.',
  'כשאתה נותן צעדים לביצוע, כתוב אותם כרשימת תבליטים קצרה (שורה שמתחילה ב-"- "), כדי שהמשתמש יוכל להפוך אותם למשימות.',
  'ייתכן שהמשתמש צעיר (נער). אל תמליץ על דיאטות קיצוניות, צום, ספירת קלוריות אגרסיבית, תוספי תזונה או חומרים. העדף אוכל רגיל, שינה ועקביות.',
  'אתה לא איש מקצוע רפואי; בנושאי בריאות, פציעות, שינה או דיבור המלץ לפנות לאיש מקצוע כשמתאים.',
  'זו שיחה מתמשכת: התייחס להודעות הקודמות בשיחה, ואל תחזור על מה שכבר אמרת.'
].join('\n');

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > MAX_BODY_CHARS * 2) reject(new Error('too_large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    return res.status(200).json({ configured: !!process.env.ANTHROPIC_API_KEY });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'not_configured' });

  let body;
  try { body = await readBody(req); } catch (e) { return res.status(400).json({ error: 'bad_request' }); }
  const mode = MODES.hasOwnProperty(body.mode) ? body.mode : 'chat';
  const question = String(body.question || '').slice(0, 2000);
  const context = JSON.stringify(body.context || {}).slice(0, MAX_BODY_CHARS);
  // previous turns of this conversation (validated, capped); the app's data is attached only to the newest message
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
  while (history.length && history[0].role !== 'user') history.shift();
  if (mode === 'chat' && !question.trim()) return res.status(400).json({ error: 'empty_question' });

  const userText = (MODES[mode] ? MODES[mode] + '\n\n' : '') + (question ? 'השאלה שלי: ' + question + '\n\n' : '') +
    'הנתונים שלי מהאפליקציה (JSON):\n' + context;

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: history.concat([{ role: 'user', content: userText }])
    });
    if (response.stop_reason === 'refusal') return res.status(200).json({ error: 'refused' });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return res.status(200).json({ text, model: response.model, truncated: response.stop_reason === 'max_tokens' });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'bad_key' });
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'rate_limited' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: 'upstream', status: err.status });
    return res.status(500).json({ error: 'server_error' });
  }
}

module.exports = handler;
module.exports.default = handler;
