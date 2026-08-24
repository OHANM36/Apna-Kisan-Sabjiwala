// supabase/functions/parse-order/index.ts
//
// यह फंक्शन ग्राहक के हिंदी/अंग्रेज़ी/Hinglish संदेश को समझकर सब्ज़ी + मात्रा निकालता है,
// और कीमत हमेशा डेटाबेस से लेता है — AI कभी भी कीमत खुद तय नहीं करता।
// AI दिमाग: Google Gemini API (generateContent + function calling)
//
// ज़रूरी Supabase Secrets (Dashboard → Edge Functions → parse-order → Secrets, या CLI से):
//   supabase secrets set GOOGLE_API_KEY=AIzaSy-xxxxxxxx
// SUPABASE_URL और SUPABASE_SERVICE_ROLE_KEY अपने आप उपलब्ध रहते हैं, अलग से सेट करने की ज़रूरत नहीं।

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-2.5-flash'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

/**
 * एक निकाले गए आइटम (सब्ज़ी नाम + मात्रा + यूनिट) को असली डेटाबेस कीमत से जोड़कर
 * सही रकम निकालता है। कीमत हमेशा यहीं से आती है — AI से कभी नहीं।
 */
function priceItem(veg, quantity, unit) {
  // 1. Tier-based कीमत पहले जांचें (अगर कोई tier ठीक-ठीक मेल खाता हो)
  if (Array.isArray(veg.price_tiers) && veg.price_tiers.length > 0) {
    const requestedGrams = toGrams(quantity, unit)
    if (requestedGrams !== null) {
      for (const tier of veg.price_tiers) {
        const tierGrams = toGrams(tier.qty, tier.unit)
        if (tierGrams !== null && Math.abs(tierGrams - requestedGrams) < 1) {
          return { ok: true, rate_label: `${tier.qty} ${tier.unit}`, item_total: Number(tier.price) }
        }
      }
    }
  }

  // 2. वज़न-आधारित (किलो/ग्राम/आधा किलो) कन्वर्ज़न
  const requestedGrams = toGrams(quantity, unit)
  const productGrams = productGramsPerUnitPrice(veg.unit)
  if (requestedGrams !== null && productGrams !== null) {
    const pricePerGram = Number(veg.price) / productGrams
    const total = Math.round(pricePerGram * requestedGrams * 100) / 100
    return { ok: true, rate_label: `${formatQtyLabel(quantity, unit)}`, item_total: total }
  }

  // 3. गिनती-आधारित (नग/गड्डी/दर्जन) यूनिट
  if (isCountUnit(unit, DOZEN_UNITS) && isCountUnit(veg.unit, PIECE_UNITS)) {
    const pieces = quantity * 12
    return { ok: true, rate_label: `${pieces} नग`, item_total: Math.round(Number(veg.price) * pieces * 100) / 100 }
  }
  if (
    (isCountUnit(unit, PIECE_UNITS) && isCountUnit(veg.unit, PIECE_UNITS)) ||
    (isCountUnit(unit, BUNCH_UNITS) && isCountUnit(veg.unit, BUNCH_UNITS))
  ) {
    return { ok: true, rate_label: `${quantity} ${veg.unit}`, item_total: Math.round(Number(veg.price) * quantity * 100) / 100 }
  }

  // माप मेल नहीं खाया — साफ़ नहीं कि कितनी मात्रा चाहिए
  return { ok: false }
}

function formatQtyLabel(qty, unit) {
  return `${qty} ${unit}`
}

// ---------- Google Gemini को structured extraction के लिए बुलाना (function calling) ----------

async function extractOrderItems(message, vegetableList) {
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
- हमेशा extract_vegetable_order फंक्शन को ही कॉल करें, कभी सीधा टेक्स्ट जवाब मत दें।`

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
    const errText = await res.text()
    throw new Error(`AI सेवा में समस्या: ${errText}`)
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI सेवा अभी सेटअप नहीं हुई है। एडमिन से संपर्क करें। (GOOGLE_API_KEY missing)' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { message } = await req.json()
    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'कोई संदेश नहीं मिला' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // हमेशा ताज़ा, असली कीमत और उपलब्धता डेटाबेस से लें
    const { data: vegetables, error: vegErr } = await supabase
      .from('vegetables')
      .select('id, name, price, unit, price_tiers, stock_status')
      .eq('is_active', true)

    if (vegErr) throw vegErr

    const extraction = await extractOrderItems(message, vegetables || [])

    const matchedItems = []
    const unmatched = []

    for (const rawItem of extraction.items || []) {
      const veg = (vegetables || []).find((v) => v.name === rawItem.matched_vegetable_name)
      if (!veg) {
        unmatched.push({ spoken_text: rawItem.spoken_text, reason: 'सब्ज़ी पहचानी नहीं गई' })
        continue
      }
      if (veg.stock_status !== 'उपलब्ध') {
        unmatched.push({ spoken_text: rawItem.spoken_text, reason: `${veg.name} अभी अनुपलब्ध है` })
        continue
      }
      const priced = priceItem(veg, Number(rawItem.quantity), rawItem.unit)
      if (!priced.ok) {
        unmatched.push({ spoken_text: rawItem.spoken_text, reason: `${veg.name} की मात्रा/माप साफ़ नहीं समझ आई` })
        continue
      }
      matchedItems.push({
        vegetable_id: veg.id,
        name: veg.name,
        unit: veg.unit,
        quantity: Number(rawItem.quantity),
        requested_unit: rawItem.unit,
        rate_label: priced.rate_label,
        item_total: priced.item_total,
      })
    }

    const total = matchedItems.reduce((s, i) => s + i.item_total, 0)

    return new Response(
      JSON.stringify({
        intent: extraction.intent,
        reply_hindi: extraction.reply_hindi,
        clarification_needed: extraction.clarification_needed || null,
        items: matchedItems,
        unmatched,
        total,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें।', detail: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
