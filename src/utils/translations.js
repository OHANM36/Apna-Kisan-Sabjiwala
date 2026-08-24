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

export function translate(key, lang) {
  const entry = translations[key]
  if (!entry) return key
  return entry[lang] || entry.hi || key
}

export default translations
