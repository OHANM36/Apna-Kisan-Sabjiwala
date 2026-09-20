// सब्ज़ी/फल खोज के लिए Hindi <-> English (और रोमन हिंदी) उपनाम (aliases)
// इससे "tomato" टाइप करने पर "टमाटर" (Hindi नाम) वाला रिज़ल्ट भी दिख जाता है,
// भले ही उस आइटम का name_en फ़ील्ड खाली क्यों न हो।
// नया आइटम जोड़ते वक्त यहां भी एक ग्रुप जोड़ दें ताकि खोज दोनों भाषाओं में काम करे।
const ALIAS_GROUPS = [
  { hi: ['आलू'], en: ['potato', 'aloo', 'alu'] },
  { hi: ['टमाटर'], en: ['tomato', 'tamatar'] },
  { hi: ['प्याज़', 'प्याज'], en: ['onion', 'pyaz', 'pyaaz'] },
  { hi: ['गाजर'], en: ['carrot', 'gajar'] },
  { hi: ['फूलगोभी', 'फूल गोभी'], en: ['cauliflower', 'phool gobi', 'gobi'] },
  { hi: ['पत्ता गोभी', 'बंद गोभी'], en: ['cabbage', 'patta gobi', 'band gobi'] },
  { hi: ['पालक'], en: ['spinach', 'palak'] },
  { hi: ['धनिया'], en: ['coriander', 'dhaniya', 'dhania', 'cilantro'] },
  { hi: ['हरी मिर्च'], en: ['green chilli', 'green chili', 'hari mirch'] },
  { hi: ['लाल मिर्च'], en: ['red chilli', 'red chili', 'lal mirch'] },
  { hi: ['शिमला मिर्च', 'कैप्सिकम'], en: ['capsicum', 'bell pepper', 'shimla mirch'] },
  { hi: ['भिन्डी', 'भिंडी'], en: ['okra', 'ladyfinger', 'lady finger', 'bhindi'] },
  { hi: ['बैंगन'], en: ['brinjal', 'eggplant', 'baingan'] },
  { hi: ['लहसुन'], en: ['garlic', 'lahsun', 'lehsun'] },
  { hi: ['अदरक'], en: ['ginger', 'adrak'] },
  { hi: ['खीरा'], en: ['cucumber', 'kheera', 'khira'] },
  { hi: ['मटर'], en: ['peas', 'matar'] },
  { hi: ['मूली'], en: ['radish', 'mooli', 'muli'] },
  { hi: ['चुकंदर'], en: ['beetroot', 'beet', 'chukandar'] },
  { hi: ['लौकी'], en: ['bottle gourd', 'lauki'] },
  { hi: ['तोरी', 'तुरई'], en: ['ridge gourd', 'tori', 'turai'] },
  { hi: ['करेला'], en: ['bitter gourd', 'karela'] },
  { hi: ['कद्दू'], en: ['pumpkin', 'kaddu'] },
  { hi: ['भुट्टा', 'मक्का'], en: ['corn', 'maize', 'bhutta', 'makka'] },
  { hi: ['शकरकंद'], en: ['sweet potato', 'shakarkand'] },
  { hi: ['सेब'], en: ['apple', 'seb'] },
  { hi: ['केला'], en: ['banana', 'kela'] },
  { hi: ['संतरा'], en: ['orange', 'santra'] },
  { hi: ['अंगूर'], en: ['grapes', 'angoor'] },
  { hi: ['अमरूद'], en: ['guava', 'amrud'] },
  { hi: ['पपीता'], en: ['papaya', 'papita'] },
  { hi: ['तरबूज़', 'तरबूज'], en: ['watermelon', 'tarbooz'] },
  { hi: ['खरबूजा'], en: ['muskmelon', 'kharbuja'] },
  { hi: ['अनार'], en: ['pomegranate', 'anar'] },
  { hi: ['नींबू'], en: ['lemon', 'nimbu', 'nimboo'] },
  { hi: ['आम'], en: ['mango', 'aam'] },
]

/**
 * किसी सब्ज़ी/फल का नाम (Hindi + English) दिए गए खोज शब्द से मेल खाता है या नहीं।
 * - सामान्य substring मैच (name, name_en) पहले जांचा जाता है
 * - फिर उपनाम (alias) सूची से क्रॉस-भाषा मैच (जैसे "tomato" -> "टमाटर")
 */
export function matchesVegetableSearch(name, nameEn, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true

  const nameLower = (name || '').toLowerCase()
  if (nameLower.includes(q)) return true

  const nameEnLower = (nameEn || '').toLowerCase()
  if (nameEnLower && nameEnLower.includes(q)) return true

  return ALIAS_GROUPS.some((group) => {
    const hindiMatches = group.hi.some((h) => nameLower.includes(h.toLowerCase()))
    if (!hindiMatches) return false
    return group.en.some((alias) => alias.includes(q) || q.includes(alias))
  })
}
