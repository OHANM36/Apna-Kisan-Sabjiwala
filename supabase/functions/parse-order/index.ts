// supabase/functions/parse-order/index.ts
//
// यह फंक्शन ग्राहक के हिंदी/अंग्रेज़ी/Hinglish संदेश को समझकर सब्ज़ी + मात्रा निकालता है,
// और कीमत हमेशा डेटाबेस से लेता है — AI कभी भी कीमत खुद तय नहीं करता।
// AI दिमाग: Google Gemini API (generateContent + function calling)
//
// ज़रूरी Supabase Secrets (Dashboard → Edge Functions → parse-order → Secrets, या CLI से):
//   supabase secrets set GOOGLE_API_KEY=AIzaSy-xxxxxxxx
// SUPABASE_URL और SUPABASE_SERVICE_ROLE_KEY अपने आप उपलब्ध रहते हैं, अलग से सेट करने की ज़रूरत नहीं।

import { clientIp, json, preflight, rateLimit, serviceClient } from '../_shared/http.ts'

const MAX_MESSAGE_CHARS = 300 // लंबे संदेश = ज़्यादा Google बिल; सीमा रखें
const MAX_QTY = 50            // place_order की सीमा से मेल खाता है (supabase/security_hardening.sql)

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-2.5-flash'

// ---------- मात्रा/माप के लिए यूनिट कन्वर्ज़न ----------

const KG_UNITS = ['किलो', 'kilo', 'kg', 'किलोग्राम']
const GRAM_UNITS = ['ग्राम', 'gram', 'g', 'gm']
const HALF_KG_UNITS = ['आधा किलो', 'half kg', 'aadha kilo']
const PIECE_UNITS = ['नग', 'piece', 'pcs', 'pc']
const BUNCH_UNITS = ['गड्डी', 'bunch']
const DOZEN_UNITS = ['दर्जन', 'dozen']

function toGrams(qty, unit) {
  const u = (unit || '').trim().toLowerCase()
  if (KG_UNITS.some((x) => x.toLowerCase() === u)) return qty * 1000
  if (GRAM_UNITS.some((x) => x.toLowerCase() === u)) return qty
  if (HALF_KG_UNITS.some((x) => x.toLowerCase() === u)) return qty * 500
  return null
}

function productGramsPerUnitPrice(productUnit) {
  const u = (productUnit || '').trim().toLowerCase()
  if (KG_UNITS.some((x) => x.toLowerCase() === u)) return 1000
  if (HALF_KG_UNITS.some((x) => x.toLowerCase() === u)) return 500
  if (GRAM_UNITS.some((x) => x.toLowerCase() === u)) return 1
  return null // गड्डी/नग जैसी count-based यूनिट - वज़न में कन्वर्ट नहीं होती
}

function isCountUnit(unit, list) {
  const u = (unit || '').trim().toLowerCase()
  return list.some((x) => x.toLowerCase() === u)
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * एक निकाले गए आइटम (सब्ज़ी नाम + मात्रा + यूनिट) को असली डेटाबेस कीमत से जोड़ता है।
 * कीमत हमेशा यहीं (DB से) आती है — AI से कभी नहीं।
 *
 * लौटाता है: कार्ट-लाइन का सही मॉडल = प्रति-इकाई कीमत (unit_price) × मात्रा (base_quantity)।
 *   tier मेल खाए → unit_price = tier की कीमत, base_quantity = 1, tier_qty/tier_unit सेट
 *   वज़न/गिनती  → unit_price = सब्ज़ी की कीमत (प्रति veg.unit), base_quantity = veg.unit की संख्या
 * item_total सिर्फ़ ग्राहक को दिखाने के लिए है; ऑर्डर की असली कीमत place_order सर्वर पर निकालता है (H3)।
 */
function priceItem(veg, quantity, unit) {
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false }

  // 1. Tier-based कीमत पहले जांचें (अगर कोई tier ठीक-ठीक मेल खाता हो)
  if (Array.isArray(veg.price_tiers) && veg.price_tiers.length > 0) {
    const requestedGrams = toGrams(quantity, unit)
    if (requestedGrams !== null) {
      for (const tier of veg.price_tiers) {
        const tierGrams = toGrams(tier.qty, tier.unit)
        if (tierGrams !== null && Math.abs(tierGrams - requestedGrams) < 1 && Number(tier.price) > 0) {
          return {
            ok: true, rate_label: `${tier.qty} ${tier.unit}`, unit_price: Number(tier.price), base_quantity: 1,
            tier_qty: Number(tier.qty), tier_unit: String(tier.unit), unit_label: `${tier.qty} ${tier.unit}`,
            item_total: r2(Number(tier.price)),
          }
        }
      }
    }
  }

  // 2. वज़न-आधारित (किलो/ग्राम/आधा किलो) कन्वर्ज़न
  const requestedGrams = toGrams(quantity, unit)
  const productGrams = productGramsPerUnitPrice(veg.unit)
  if (requestedGrams !== null && productGrams !== null) {
    const base = r3(requestedGrams / productGrams)
    if (base <= 0 || base > MAX_QTY) return { ok: false, tooMuch: base > MAX_QTY }
    return {
      ok: true, rate_label: formatQtyLabel(quantity, unit), unit_price: Number(veg.price), base_quantity: base,
      tier_qty: null, tier_unit: null, unit_label: veg.unit, item_total: r2(Number(veg.price) * base),
    }
  }

  // 3. गिनती-आधारित (नग/गड्डी/दर्जन) यूनिट
  let base: number | null = null
  let label = ''
  if (isCountUnit(unit, DOZEN_UNITS) && isCountUnit(veg.unit, PIECE_UNITS)) {
    base = r3(quantity * 12)
    label = `${base} नग`
  } else if (
    (isCountUnit(unit, PIECE_UNITS) && isCountUnit(veg.unit, PIECE_UNITS)) ||
    (isCountUnit(unit, BUNCH_UNITS) && isCountUnit(veg.unit, BUNCH_UNITS))
  ) {
    base = r3(quantity)
    label = `${quantity} ${veg.unit}`
  }
  if (base !== null) {
    if (base <= 0 || base > MAX_QTY) return { ok: false, tooMuch: base > MAX_QTY }
    return {
      ok: true, rate_label: label, unit_price: Number(veg.price), base_quantity: base,
      tier_qty: null, tier_unit: null, unit_label: veg.unit, item_total: r2(Number(veg.price) * base),
    }
  }

  // माप मेल नहीं खाया — साफ़ नहीं कि कितनी मात्रा चाहिए
  return { ok: false }
}

function formatQtyLabel(qty, unit) {
  return `${qty} ${unit}`
}

// ---------- Google Gemini को structured extraction के लिए बुलाना (function calling) ----------

async function extractOrderItems(message, vegetableList, lang = 'hi') {
  const vegNamesForPrompt = vegetableList.map((v) => `- ${v.name} (${v.unit})`).join('\n')

  const systemPrompt = `आप "अपना किसान सब्ज़ीवाला" ऐप के लिए एक ऑर्डर समझने वाले सहायक हैं।
ग्राहक हिंदी, अंग्रेज़ी, या Hinglish में सब्ज़ी ऑर्डर करने की कोशिश कर रहा है।

अभी उपलब्ध सब्ज़ियों की पूरी लिस्ट (सिर्फ़ इन्हीं में से नाम चुनें, बिल्कुल वैसे ही जैसे लिखा है):
${vegNamesForPrompt}

नियम:
- matched_vegetable_name हमेशा ऊपर की लिस्ट में से बिल्कुल वैसे ही (exact) होना चाहिए, या अगर पक्का यकीन न हो तो खाली छोड़ दें — कभी नया नाम मत बनाएं।
- कभी भी कीमत/रुपये का ज़िक्र मत करें — यह जानकारी आपके पास नहीं है, सिस्टम खुद डेटाबेस से कीमत जोड़ेगा।
- मात्रा और यूनिट को हमेशा इनमें से किसी एक में बदलें: किलो, ग्राम, आधा किलो, नग, गड्डी, दर्जन।
- अगर ग्राहक ने सिर्फ सब्ज़ी का नाम बताया पर मात्रा नहीं बताई, तो items में मत डालें — clarification_needed में हिंदी में पूछें "कितना/कितनी चाहिए?"
- reply_hindi छोटा, दोस्ताना और बिना रुपये के आंकड़ों वाला होना चाहिए।
- हमेशा extract_vegetable_order फंक्शन को ही कॉल करें, कभी सीधा टेक्स्ट जवाब मत दें।${lang === 'en' ? '\n- ग्राहक ने ऐप अंग्रेज़ी में चुना है: reply_hindi (फ़ील्ड का नाम वही रहेगा) और clarification_needed सरल English में लिखें, हिंदी में नहीं। matched_vegetable_name फिर भी लिस्ट से बिल्कुल वैसा ही रहे।' : ''}`

  const functionDeclaration = {
    name: 'extract_vegetable_order',
    description: 'ग्राहक के संदेश से सब्ज़ी ऑर्डर की जानकारी निकालें',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['order', 'question', 'chitchat', 'unclear'] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              matched_vegetable_name: { type: 'string', nullable: true },
              quantity: { type: 'number' },
              unit: { type: 'string' },
              spoken_text: { type: 'string' },
            },
            required: ['quantity', 'unit', 'spoken_text'],
          },
        },
        clarification_needed: { type: 'string', nullable: true },
        reply_hindi: { type: 'string' },
      },
      required: ['intent', 'items', 'reply_hindi'],
    },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        tools: [{ functionDeclarations: [functionDeclaration] }],
        tool_config: {
          function_calling_config: { mode: 'ANY', allowed_function_names: ['extract_vegetable_order'] },
        },
      }),
    }
  )

  if (!res.ok) {
    console.error('Gemini error', res.status, await res.text()) // सिर्फ़ सर्वर लॉग में; ग्राहक को नहीं
    throw new Error('AI_UPSTREAM_ERROR')
  }

  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  const functionCallPart = parts.find((p) => p.functionCall)
  if (!functionCallPart) throw new Error('AI से सही जवाब नहीं मिला')

  const args = functionCallPart.functionCall.args
  // matched_vegetable_name खाली स्ट्रिंग या undefined हो सकता है — null में बदलें ताकि आगे का कोड एक जैसा रहे
  if (Array.isArray(args.items)) {
    args.items = args.items.map((item) => ({
      ...item,
      matched_vegetable_name: item.matched_vegetable_name || null,
    }))
  }
  return args
}

// ---------- मुख्य हैंडलर ----------

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const lang = body?.language === 'en' ? 'en' : 'hi'
    const L = (hi, en) => (lang === 'en' ? en : hi)

    if (!GOOGLE_API_KEY) {
      return json(req, { error: L('AI सेवा अभी सेटअप नहीं हुई है। एडमिन से संपर्क करें।', 'The AI service is not set up yet. Please contact the admin.') }, 500)
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!message) return json(req, { error: L('कोई संदेश नहीं मिला', 'No message received') }, 400)
    if (message.length > MAX_MESSAGE_CHARS) {
      return json(req, { error: L(`संदेश छोटा रखें (अधिकतम ${MAX_MESSAGE_CHARS} अक्षर)`, `Please keep the message short (max ${MAX_MESSAGE_CHARS} characters)`) }, 400)
    }

    const supabase = serviceClient()

    // हर कॉल आपकी Google API key पर बिल बनाती है → IP के हिसाब से सीमा
    if (!(await rateLimit(supabase, 'ai_parse', `ip:${clientIp(req)}`, 30, 10))) {
      return json(req, { error: L('बहुत ज़्यादा अनुरोध। कृपया कुछ मिनट बाद कोशिश करें।', 'Too many requests. Please try again in a few minutes.') }, 429)
    }

    // हमेशा ताज़ा, असली कीमत और उपलब्धता डेटाबेस से लें — सिर्फ़ दुकान की अपनी + अप्रूव्ड/सक्रिय सेलर की सब्ज़ियाँ
    const [{ data: allVeg, error: vegErr }, { data: okSellers, error: selErr }] = await Promise.all([
      supabase.from('vegetables').select('id, name, name_en, price, unit, price_tiers, stock_status, seller_id').eq('is_active', true),
      supabase.from('sellers').select('id, business_name').eq('is_approved', true).eq('is_active', true),
    ])
    if (vegErr) throw vegErr
    if (selErr) throw selErr
    const sellerName = new Map((okSellers || []).map((s) => [s.id, s.business_name]))
    const vegetables = (allVeg || []).filter((v) => !v.seller_id || sellerName.has(v.seller_id))

    const extraction = await extractOrderItems(message, vegetables, lang)

    const matchedItems = []
    const unmatched = []

    for (const rawItem of (extraction.items || []).slice(0, 20)) {
      const veg = vegetables.find((v) => v.name === rawItem.matched_vegetable_name)
      if (!veg) {
        unmatched.push({ spoken_text: rawItem.spoken_text, reason: L('सब्ज़ी पहचानी नहीं गई', 'Vegetable not recognised') })
        continue
      }
      if (veg.stock_status !== 'उपलब्ध') {
        unmatched.push({ spoken_text: rawItem.spoken_text, reason: L(`${veg.name} अभी अनुपलब्ध है`, `${lang === 'en' && veg.name_en ? veg.name_en : veg.name} is currently unavailable`) })
        continue
      }
      const priced = priceItem(veg, Number(rawItem.quantity), rawItem.unit)
      if (!priced.ok) {
        unmatched.push({
          spoken_text: rawItem.spoken_text,
          reason: priced.tooMuch
            ? L(`${veg.name} की मात्रा बहुत ज़्यादा है`, `The quantity for ${lang === 'en' && veg.name_en ? veg.name_en : veg.name} is too large`)
            : L(`${veg.name} की मात्रा/माप साफ़ नहीं समझ आई`, `Could not understand the quantity/unit for ${lang === 'en' && veg.name_en ? veg.name_en : veg.name}`),
        })
        continue
      }
      matchedItems.push({
        vegetable_id: veg.id,
        seller_id: veg.seller_id || null,
        seller_name: veg.seller_id ? sellerName.get(veg.seller_id) || null : null,
        name: veg.name,
        name_en: veg.name_en || null,
        unit: priced.unit_label,
        rate_label: priced.rate_label,
        unit_price: priced.unit_price,        // प्रति-इकाई कीमत (DB से)
        base_quantity: priced.base_quantity,  // कार्ट में मात्रा = कितनी इकाइयाँ
        tier_qty: priced.tier_qty,
        tier_unit: priced.tier_unit,
        item_total: priced.item_total,        // सिर्फ़ दिखाने के लिए
      })
    }

    const total = r2(matchedItems.reduce((s, i) => s + i.item_total, 0))

    return json(req, {
      intent: extraction.intent,
      reply_hindi: extraction.reply_hindi,
      clarification_needed: extraction.clarification_needed || null,
      items: matchedItems,
      unmatched,
      total,
    })
  } catch (err) {
    console.error('parse-order', err)
    // detail कभी नहीं भेजते: upstream (Gemini) का error-text ग्राहक को नहीं जाना चाहिए
    return json(req, { error: 'कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें। / Something went wrong. Please try again.' }, 500)
  }
})
