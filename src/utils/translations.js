// भाषा शब्दकोश — हर जगह की टेक्स्ट यहां hi/en दोनों में
// नया key जोड़ते वक्त दोनों भाषाओं में ज़रूर भरें

const translations = {
  // ऐप ब्रांडिंग
  app_name: { hi: 'अपना किसान सब्ज़ीवाला', en: 'Apna Kisan Sabjiwala' },
  app_tagline: { hi: 'ताज़ी सब्ज़ियाँ — सीधे आपके घर तक', en: 'Fresh vegetables — straight to your door' },

  // Header
  search_placeholder: { hi: 'सब्ज़ी खोजें... जैसे आलू, टमाटर', en: 'Search vegetables... e.g. potato, tomato' },

  // BottomNav
  nav_home: { hi: 'होम', en: 'Home' },
  nav_categories: { hi: 'श्रेणियाँ', en: 'Categories' },
  nav_cart: { hi: 'कार्ट', en: 'Cart' },
  nav_orders: { hi: 'ऑर्डर', en: 'Orders' },

  // Home page
  home_min_order: { hi: 'न्यूनतम ऑर्डर', en: 'Min order' },
  home_delivery_fee: { hi: 'डिलीवरी शुल्क', en: 'Delivery fee' },
  home_view_vendors: { hi: '🧑‍🌾 हमारे विक्रेता देखें', en: '🧑‍🌾 View our vendors' },
  home_available_today: { hi: 'आज की उपलब्ध सब्ज़ियाँ', en: "Today's available vegetables" },
  home_search_results: { hi: 'खोज परिणाम', en: 'Search results for' },
  home_loading_vegetables: { hi: 'सब्ज़ियाँ लोड हो रही हैं...', en: 'Loading vegetables...' },
  home_no_results: { hi: 'कोई सब्ज़ी नहीं मिली', en: 'No vegetables found' },
  home_store_closed: { hi: 'फिलहाल स्टोर बंद है। कृपया बाद में ऑर्डर करें।', en: 'Store is closed right now. Please order later.' },
  category_all: { hi: 'सभी', en: 'All' },
  categories_page_title: { hi: 'सब्ज़ियों की श्रेणियाँ', en: 'Vegetable Categories' },

  // VegetableCard
  veg_fresh_tag: { hi: '🌿 ताज़ा', en: '🌿 Fresh' },
  veg_add_to_cart: { hi: 'कार्ट में डालें', en: 'Add to Cart' },
  veg_unavailable: { hi: 'अनुपलब्ध', en: 'Unavailable' },
  veg_off: { hi: 'छूट', en: 'off' },

  // Cart page
  cart_title: { hi: 'आपका कार्ट', en: 'Your Cart' },
  cart_empty_title: { hi: 'आपका कार्ट खाली है', en: 'Your cart is empty' },
  cart_empty_subtitle: { hi: 'कुछ ताज़ी सब्ज़ियाँ जोड़ें और ऑर्डर करें', en: 'Add some fresh vegetables and place an order' },
  cart_browse_vegetables: { hi: 'सब्ज़ियाँ देखें', en: 'Browse Vegetables' },
  cart_remove: { hi: 'हटाएं', en: 'Remove' },
  cart_below_min: { hi: 'न्यूनतम ऑर्डर राशि', en: 'Minimum order amount is' },
  cart_add_more: { hi: 'है। कृपया और की सब्ज़ियाँ जोड़ें।', en: 'Please add more vegetables worth' },
  cart_subtotal: { hi: 'सामान का कुल मूल्य', en: 'Item subtotal' },
  cart_delivery_fee: { hi: 'डिलीवरी शुल्क', en: 'Delivery fee' },
  cart_free: { hi: 'मुफ़्त', en: 'Free' },
  cart_total: { hi: 'कुल भुगतान', en: 'Total payment' },
  cart_proceed: { hi: 'ऑर्डर करने के लिए आगे बढ़ें', en: 'Proceed to Order' },

  // Checkout page
  checkout_delivery_info: { hi: 'डिलीवरी की जानकारी', en: 'Delivery Information' },
  checkout_customer_name: { hi: 'ग्राहक का नाम', en: 'Customer Name' },
  checkout_name_placeholder: { hi: 'अपना पूरा नाम लिखें', en: 'Enter your full name' },
  checkout_phone: { hi: 'मोबाइल नंबर', en: 'Mobile Number' },
  checkout_phone_placeholder: { hi: '10 अंकों का मोबाइल नंबर', en: '10-digit mobile number' },
  checkout_use_location: { hi: 'मेरी वर्तमान लोकेशन का उपयोग करें', en: 'Use my current location' },
  checkout_locating: { hi: 'लोकेशन ढूंढी जा रही है...', en: 'Finding location...' },
  checkout_address: { hi: 'पूरा पता', en: 'Full Address' },
  checkout_address_placeholder: { hi: 'मकान नंबर, गली नंबर आदि', en: 'House no., street no., etc.' },
  checkout_mohalla: { hi: 'मोहल्ला / कॉलोनी', en: 'Neighborhood / Colony' },
  checkout_city: { hi: 'शहर', en: 'City' },
  checkout_pincode: { hi: 'पिन कोड', en: 'Pincode' },
  checkout_delivery_date: { hi: 'डिलीवरी की तारीख', en: 'Delivery Date' },
  checkout_delivery_time: { hi: 'डिलीवरी का समय', en: 'Delivery Time' },
  checkout_extra_notes: { hi: 'अतिरिक्त जानकारी (वैकल्पिक)', en: 'Additional notes (optional)' },
  checkout_notes_placeholder: { hi: 'कोई खास निर्देश हो तो लिखें', en: 'Any special instructions' },
  checkout_coupon: { hi: 'कूपन कोड', en: 'Coupon Code' },
  checkout_coupon_placeholder: { hi: 'कूपन कोड डालें', en: 'Enter coupon code' },
  checkout_apply: { hi: 'लागू करें', en: 'Apply' },
  checkout_discount: { hi: 'छूट', en: 'Discount' },
  checkout_total_amount: { hi: 'कुल भुगतान राशि', en: 'Total Payment Amount' },
  checkout_online_only: {
    hi: 'केवल ऑनलाइन भुगतान उपलब्ध है (UPI / कार्ड / नेट बैंकिंग) — कैश ऑन डिलीवरी उपलब्ध नहीं है।',
    en: 'Only online payment available (UPI / Card / Net Banking) — Cash on delivery is not available.',
  },
  checkout_pay_button: { hi: 'का ऑनलाइन भुगतान करें', en: 'Pay Online' },
  checkout_processing: { hi: 'प्रोसेस हो रहा है...', en: 'Processing...' },

  // Checkout validation/coupon messages
  err_name_required: { hi: 'नाम आवश्यक है', en: 'Name is required' },
  err_phone_invalid: { hi: 'सही मोबाइल नंबर डालें (10 अंक)', en: 'Enter a valid mobile number (10 digits)' },
  err_address_required: { hi: 'पूरा पता आवश्यक है', en: 'Full address is required' },
  err_city_required: { hi: 'शहर आवश्यक है', en: 'City is required' },
  err_pincode_invalid: { hi: 'सही पिन कोड डालें (6 अंक)', en: 'Enter a valid pincode (6 digits)' },
  err_delivery_date_required: { hi: 'डिलीवरी की तारीख चुनें', en: 'Select a delivery date' },
  err_location_failed: { hi: 'लोकेशन नहीं मिल सकी। कृपया पता खुद लिखें।', en: 'Could not get location. Please enter address manually.' },
  err_coupon_invalid: { hi: 'यह कूपन कोड मान्य नहीं है', en: 'This coupon code is not valid' },
  err_coupon_min_order: { hi: 'इस कूपन के लिए न्यूनतम ऑर्डर होना चाहिए', en: 'This coupon requires a minimum order of' },
  msg_coupon_applied: { hi: 'कूपन लागू हुआ! आपको छूट मिली', en: 'Coupon applied! You got a discount of' },
  err_payment_retry: { hi: 'कृपया दोबारा भुगतान करने का प्रयास करें।', en: 'Please try the payment again.' },
  err_generic: { hi: 'कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें।', en: 'Something went wrong. Please try again.' },

  // Order Confirmation
  order_success: { hi: 'आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है।', en: 'Your order has been placed successfully.' },
  order_number: { hi: 'ऑर्डर नंबर', en: 'Order Number' },
  order_status_title: { hi: 'ऑर्डर की स्थिति', en: 'Order Status' },
  order_details: { hi: 'ऑर्डर का विवरण', en: 'Order Details' },
  order_delivery_address: { hi: 'डिलीवरी पता', en: 'Delivery Address' },
  order_payment_status: { hi: 'भुगतान की स्थिति', en: 'Payment Status' },
  order_send_whatsapp: { hi: 'WhatsApp पर ऑर्डर भेजें', en: 'Send Order on WhatsApp' },
  order_view_my_orders: { hi: 'मेरे ऑर्डर देखें', en: 'View My Orders' },

  // सामान्य
  loading: { hi: 'लोड हो रहा है...', en: 'Loading...' },
  order_not_found: { hi: 'ऑर्डर नहीं मिला', en: 'Order not found' },
}

// डेटाबेस में सेव स्थिति-मान (order_status, payment_status) दिखाने के लिए अनुवाद
const statusMap = {
  'नया ऑर्डर': { hi: 'नया ऑर्डर', en: 'New Order' },
  'भुगतान सफल': { hi: 'भुगतान सफल', en: 'Payment Successful' },
  'स्वीकार किया गया': { hi: 'स्वीकार किया गया', en: 'Accepted' },
  'सामान तैयार हो रहा है': { hi: 'सामान तैयार हो रहा है', en: 'Preparing Order' },
  'डिलीवरी के लिए निकल गया': { hi: 'डिलीवरी के लिए निकल गया', en: 'Out for Delivery' },
  'डिलीवरी पूरी हुई': { hi: 'डिलीवरी पूरी हुई', en: 'Delivered' },
  'रद्द': { hi: 'रद्द', en: 'Cancelled' },
  'लंबित': { hi: 'लंबित', en: 'Pending' },
  'सफल': { hi: 'सफल', en: 'Successful' },
  'असफल': { hi: 'असफल', en: 'Failed' },
  'रिफंड': { hi: 'रिफंड', en: 'Refunded' },
}

export function translateStatus(value, lang) {
  const entry = statusMap[value]
  if (!entry) return value
  return entry[lang] || entry.hi || value
}

// डिलीवरी समय-स्लॉट (schema में फिक्स्ड लिस्ट है, इसलिए यहां भी अनुवाद संभव — 
// डेटाबेस में स्टोर हमेशा हिंदी वैल्यू से होता है, दिखाने के वक्त भाषा अनुसार बदलता है)
const timeSlotMap = {
  'सुबह 7 - 9 बजे': { hi: 'सुबह 7 - 9 बजे', en: '7 - 9 AM' },
  'सुबह 9 - 11 बजे': { hi: 'सुबह 9 - 11 बजे', en: '9 - 11 AM' },
  'दोपहर 12 - 2 बजे': { hi: 'दोपहर 12 - 2 बजे', en: '12 - 2 PM' },
  'शाम 4 - 6 बजे': { hi: 'शाम 4 - 6 बजे', en: '4 - 6 PM' },
  'शाम 6 - 8 बजे': { hi: 'शाम 6 - 8 बजे', en: '6 - 8 PM' },
}

export function translateTimeSlot(value, lang) {
  const entry = timeSlotMap[value]
  if (!entry) return value
  return entry[lang] || entry.hi || value
}

// माप की इकाई (यूनिट) — किलो/ग्राम/आधा किलो/नग/गड्डी/दर्जन एक फिक्स्ड लिस्ट है, अनुवाद संभव
const unitMap = {
  'किलो': { hi: 'किलो', en: 'kg' },
  'आधा किलो': { hi: 'आधा किलो', en: 'half kg' },
  'ग्राम': { hi: 'ग्राम', en: 'gram' },
  'गड्डी': { hi: 'गड्डी', en: 'bunch' },
  'नग': { hi: 'नग', en: 'piece' },
  'दर्जन': { hi: 'दर्जन', en: 'dozen' },
}

export function translateUnit(value, lang) {
  const entry = unitMap[value]
  if (!entry) return value
  return entry[lang] || entry.hi || value
}

/**
 * डेटाबेस के किसी रिकॉर्ड (सब्ज़ी/श्रेणी) से भाषा अनुसार सही नाम चुनता है।
 * अगर English नाम एडमिन ने नहीं भरा, तो हमेशा हिंदी नाम ही दिखता है (fallback)।
 */
export function pickLocalizedName(record, lang) {
  if (!record) return ''
  if (lang === 'en' && record.name_en && record.name_en.trim()) return record.name_en
  return record.name
}

export function translate(key, lang) {
  const entry = translations[key]
  if (!entry) return key
  return entry[lang] || entry.hi || key
}

export default translations
