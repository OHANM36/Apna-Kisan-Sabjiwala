// supabase/functions/speech-to-text/index.ts
//
// ब्राउज़र से रिकॉर्ड की गई आवाज़ (base64 audio) को Google Cloud Speech-to-Text से
// टेक्स्ट में बदलता है। API key यहां सर्वर-साइड सुरक्षित रहती है, ब्राउज़र में कभी नहीं जाती।
//
// ज़रूरी Supabase Secret:
//   supabase secrets set GOOGLE_API_KEY=AIzaSy-xxxxxxxx
// (यह वही key इस्तेमाल हो सकती है जो parse-order फंक्शन में डाली थी,
//  बस Google Cloud Console में उस key के लिए "Cloud Speech-to-Text API" चालू करना ज़रूरी है)

import { clientIp, json, preflight, rateLimit, serviceClient } from '../_shared/http.ts'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? ''
const MAX_AUDIO_BASE64_CHARS = 1_400_000 // ≈ 1 MB ऑडियो (कुछ दस सेकंड की आवाज़ के लिए काफ़ी)

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const lang = body?.language === 'en' ? 'en' : 'hi'
    const L = (hi, en) => (lang === 'en' ? en : hi)

    if (!GOOGLE_API_KEY) {
      return json(req, { error: L('वॉइस सेवा अभी सेटअप नहीं हुई है। एडमिन से संपर्क करें।', 'The voice service is not set up yet. Please contact the admin.') }, 500)
    }

    const audio = typeof body?.audio_base64 === 'string' ? body.audio_base64 : ''
    if (!audio) return json(req, { error: L('कोई ऑडियो नहीं मिला', 'No audio received') }, 400)
    if (audio.length > MAX_AUDIO_BASE64_CHARS || !/^[A-Za-z0-9+/=]+$/.test(audio)) {
      return json(req, { error: L('ऑडियो बहुत लंबा है। छोटा बोलकर दोबारा कोशिश करें।', 'The audio is too long. Please speak a little less and try again.') }, 400)
    }

    if (!(await rateLimit(serviceClient(), 'speech', `ip:${clientIp(req)}`, 15, 10))) {
      return json(req, { error: L('बहुत ज़्यादा अनुरोध। कृपया कुछ मिनट बाद कोशिश करें।', 'Too many requests. Please try again in a few minutes.') }, 429)
    }

    const res = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_API_KEY }, // key URL में नहीं (लॉग में न दिखे)
      body: JSON.stringify({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          // चुनी हुई भाषा पहले, दूसरी वैकल्पिक — Hinglish बोलने वालों के लिए दोनों चालू रहती हैं
          languageCode: lang === 'en' ? 'en-IN' : 'hi-IN',
          alternativeLanguageCodes: [lang === 'en' ? 'hi-IN' : 'en-IN'],
        },
        audio: { content: audio },
      }),
    })

    if (!res.ok) {
      console.error('Speech-to-Text error', res.status, await res.text())
      return json(req, { error: L('आवाज़ समझने में गड़बड़ी हुई। कृपया दोबारा प्रयास करें।', 'Could not process the voice. Please try again.') }, 502)
    }

    const data = await res.json()
    const transcript = data.results?.map((r) => r.alternatives?.[0]?.transcript).join(' ').trim() || ''

    if (!transcript) return json(req, { error: L('आवाज़ साफ़ समझ नहीं आई। कृपया दोबारा बोलें।', 'Could not hear clearly. Please speak again.') })
    return json(req, { transcript: transcript.slice(0, 300) })
  } catch (err) {
    console.error('speech-to-text', err)
    return json(req, { error: 'आवाज़ समझने में गड़बड़ी हुई। कृपया दोबारा प्रयास करें। / Voice error. Please try again.' }, 500)
  }
})
