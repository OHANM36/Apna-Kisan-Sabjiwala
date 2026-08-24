// supabase/functions/speech-to-text/index.ts
//
// ब्राउज़र से रिकॉर्ड की गई आवाज़ (base64 audio) को Google Cloud Speech-to-Text से
// टेक्स्ट में बदलता है। API key यहां सर्वर-साइड सुरक्षित रहती है, ब्राउज़र में कभी नहीं जाती।
//
// ज़रूरी Supabase Secret:
//   supabase secrets set GOOGLE_API_KEY=AIzaSy-xxxxxxxx
// (यह वही key इस्तेमाल हो सकती है जो parse-order फंक्शन में डाली थी,
//  बस Google Cloud Console में उस key के लिए "Cloud Speech-to-Text API" चालू करना ज़रूरी है)

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'वॉइस सेवा अभी सेटअप नहीं हुई है। एडमिन से संपर्क करें। (GOOGLE_API_KEY missing)' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { audio_base64 } = await req.json()
    if (!audio_base64) {
      return new Response(JSON.stringify({ error: 'कोई ऑडियो नहीं मिला' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'hi-IN',
          alternativeLanguageCodes: ['en-IN'],
        },
        audio: { content: audio_base64 },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Speech-to-Text सेवा में समस्या: ${errText}`)
    }

    const data = await res.json()
    const transcript = data.results?.map((r) => r.alternatives?.[0]?.transcript).join(' ').trim() || ''

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'आवाज़ साफ़ समझ नहीं आई। कृपया दोबारा बोलें।' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'आवाज़ समझने में गड़बड़ी हुई। कृपया दोबारा प्रयास करें।', detail: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
