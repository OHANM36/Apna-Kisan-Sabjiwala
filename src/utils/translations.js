// भाषा शब्दकोश — हर जगह की टेक्स्ट यहां hi/en दोनों में
// नया key जोड़ते वक्त दोनों भाषाओं में ज़रूर भरें

const translations = {
  // ऐप ब्रांडिंग
  app_name: { hi: 'अपना किसान सब्ज़ीवाला', en: 'Apna Kisan Sabjiwala' },
  app_tagline: { hi: 'ताज़ी सब्ज़ियाँ — सीधे आपके घर तक', en: 'Fresh vegetables — straight to your door' },

  // चेकआउट: डिलीवरी समय की जाँच
  checkout_slot_passed: { hi: 'समय निकल गया', en: 'time passed' },
  checkout_slot_invalid: { hi: 'यह समय निकल चुका है — कोई और स्लॉट या तारीख चुनें', en: 'This slot has passed — pick another slot or date' },
  checkout_today_full: { hi: 'आज के सभी स्लॉट पूरे हो गए, इसलिए कल की तारीख चुनी गई है', en: "Today's slots are over, so tomorrow is selected" },

  // PWA इंस्टॉल
  install_app: { hi: 'ऐप इंस्टॉल करें', en: 'Install app' },
  install_ios_help: { hi: 'Safari में नीचे "Share" (⬆️) दबाएँ, फिर "Add to Home Screen" चुनें।', en: 'In Safari, tap the Share (⬆️) button, then choose "Add to Home Screen".' },
  install_ok: { hi: 'ठीक है', en: 'OK' },

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
  cart_min_order_msg: {
    hi: 'न्यूनतम ऑर्डर ₹{min} का है। ऑर्डर करने के लिए ₹{add} और जोड़ें।',
    en: 'Minimum order value is ₹{min}. Add ₹{add} more to place your order.',
  },
  cart_prices_updated: { hi: 'कुछ सब्ज़ियों की कीमत अपडेट हुई है। कृपया कार्ट देखकर आगे बढ़ें।', en: 'Some vegetable prices were updated. Please review your cart before continuing.' },
  cart_items_removed: { hi: 'कुछ सब्ज़ियाँ अब उपलब्ध नहीं हैं और कार्ट से हटा दी गईं।', en: 'Some items are no longer available and were removed from your cart.' },
  cart_delivery_free_hint: { hi: '₹{add} और जोड़ें — डिलीवरी मुफ़्त!', en: 'Add ₹{add} more for free delivery!' },
  cart_delivery_cheaper_hint: { hi: '₹{add} और जोड़ें — डिलीवरी शुल्क सिर्फ़ ₹{fee}', en: 'Add ₹{add} more — delivery only ₹{fee}' },
  home_offline_prices: { hi: 'इंटरनेट नहीं है — पिछली बार सेव की गई कीमतें दिख रही हैं।', en: 'You are offline — showing the last saved prices.' },
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
  checkout_location_autofilled: { hi: 'आपकी लोकेशन से पता भरा गया है — कृपया मकान नंबर और लैंडमार्क जोड़ें/जाँचें।', en: 'Address filled from your location — please add/check house number and landmark.' },
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
  checkout_payment_method: { hi: 'भुगतान का तरीका', en: 'Payment Method' },
  checkout_method_online: { hi: 'ऑनलाइन भुगतान', en: 'Pay Online' },
  checkout_method_online_desc: { hi: 'UPI / कार्ड / नेट बैंकिंग', en: 'UPI / Card / Net Banking' },
  checkout_method_cod: { hi: 'कैश ऑन डिलीवरी', en: 'Cash on Delivery' },
  checkout_method_cod_desc: { hi: 'सामान मिलने पर डिलीवरी बॉय को कैश दें', en: 'Pay cash to the delivery person when you receive your order' },
  checkout_method_cod_online: { hi: 'डिलीवरी पर ऑनलाइन भुगतान (UPI)', en: 'Pay Online on Delivery (UPI)' },
  checkout_method_cod_online_desc: { hi: 'सामान मिलने पर डिलीवरी बॉय का QR स्कैन करके UPI से दें', en: 'Scan the delivery person\'s QR and pay by UPI when you receive your order' },
  checkout_cod_limit: {
    hi: 'कैश ऑन डिलीवरी सिर्फ़ {max} तक के ऑर्डर पर उपलब्ध है। ऑनलाइन भुगतान चुनें या कार्ट घटाएँ।',
    en: 'Cash on Delivery is available only for orders up to {max}. Choose online payment or reduce your cart.',
  },
  checkout_cod_online_button: { hi: 'ऑर्डर करें (डिलीवरी पर UPI भुगतान)', en: 'Place Order (Pay by UPI on Delivery)' },
  checkout_cod_button: { hi: 'ऑर्डर करें (कैश ऑन डिलीवरी)', en: 'Place Order (Cash on Delivery)' },
  order_cod_title: { hi: 'कैश ऑन डिलीवरी', en: 'Cash on Delivery' },
  order_cod_placed: { hi: 'ऑर्डर दर्ज हो गया — डिलीवरी पर भुगतान करें', en: 'Order placed — pay on delivery' },
  order_cod_pay_note: { hi: 'डिलीवरी पर {amount} कैश दें। पैसे देने के बाद ही डिलीवरी पिन बताएँ।', en: 'Pay {amount} in cash on delivery. Share the delivery PIN only after paying.' },
  order_cod_online_title: { hi: 'डिलीवरी पर ऑनलाइन भुगतान (UPI)', en: 'Pay Online on Delivery (UPI)' },
  order_cod_online_pay_note: { hi: 'डिलीवरी पर {amount} UPI से दें — डिलीवरी बॉय QR दिखाएगा। पैसे देने के बाद ही डिलीवरी पिन बताएँ।', en: 'Pay {amount} by UPI on delivery — the delivery person will show a QR. Share the delivery PIN only after paying.' },
  order_cod_online_received: { hi: 'ऑनलाइन भुगतान हो गया', en: 'Online payment done' },
  order_cod_received: { hi: 'कैश दे दिया गया', en: 'Cash paid' },
  checkout_processing: { hi: 'प्रोसेस हो रहा है...', en: 'Processing...' },

  // Checkout validation/coupon messages
  err_name_required: { hi: 'नाम आवश्यक है', en: 'Name is required' },
  err_phone_invalid: { hi: 'सही मोबाइल नंबर डालें (10 अंक)', en: 'Enter a valid mobile number (10 digits)' },
  err_address_required: { hi: 'पूरा पता आवश्यक है', en: 'Full address is required' },
  err_city_required: { hi: 'शहर आवश्यक है', en: 'City is required' },
  err_pincode_invalid: { hi: 'सही पिन कोड डालें (6 अंक)', en: 'Enter a valid pincode (6 digits)' },
  err_delivery_date_required: { hi: 'डिलीवरी की तारीख चुनें', en: 'Select a delivery date' },
  err_location_failed: { hi: 'लोकेशन नहीं मिल सकी। कृपया पता खुद लिखें।', en: 'Could not get location. Please enter address manually.' },
  err_location_required: { hi: 'ऑर्डर के लिए आपकी वर्तमान लोकेशन ज़रूरी है। कृपया "मेरी वर्तमान लोकेशन का उपयोग करें" दबाएँ और लोकेशन की अनुमति दें।', en: 'Your current location is required to place the order. Please tap "Use my current location" and allow location access.' },
  checkout_location_required_hint: { hi: 'ऑर्डर देने के लिए वर्तमान लोकेशन ज़रूरी है', en: 'Current location is required to place the order' },
  checkout_location_captured: { hi: 'आपकी लोकेशन मिल गई है ✓', en: 'Your location has been captured ✓' },
  checkout_location_address_failed: { hi: 'आपकी लोकेशन मिल गई है ✓ पर पता अपने-आप नहीं भर सका — कृपया पता खुद लिखें।', en: 'Your location has been captured ✓ but the address could not be filled — please type the address.' },
  err_coupon_invalid: { hi: 'यह कूपन कोड मान्य नहीं है', en: 'This coupon code is not valid' },
  err_coupon_min_order: { hi: 'इस कूपन के लिए न्यूनतम ऑर्डर होना चाहिए', en: 'This coupon requires a minimum order of' },
  msg_coupon_applied: { hi: 'कूपन लागू हुआ! आपको छूट मिली', en: 'Coupon applied! You got a discount of' },
  err_payment_retry: { hi: 'कृपया दोबारा भुगतान करने का प्रयास करें।', en: 'Please try the payment again.' },
  err_generic: { hi: 'कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें।', en: 'Something went wrong. Please try again.' },

  // Order Confirmation
  order_success: { hi: 'आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है।', en: 'Your order has been placed successfully.' },
  order_number: { hi: 'ऑर्डर नंबर', en: 'Order Number' },
  order_delivery_pin_title: { hi: '🔐 आपका डिलीवरी पिन', en: '🔐 Your Delivery PIN' },
  order_delivery_pin_note: {
    hi: 'सामान मिलने पर यह पिन डिलीवरी बॉय को बताएं — इससे आपकी डिलीवरी कन्फर्म होगी।',
    en: 'Share this PIN with the delivery person when you receive your order — it confirms your delivery.',
  },
  order_status_title: { hi: 'ऑर्डर की स्थिति', en: 'Order Status' },
  order_details: { hi: 'ऑर्डर का विवरण', en: 'Order Details' },
  order_delivery_address: { hi: 'डिलीवरी पता', en: 'Delivery Address' },
  order_payment_status: { hi: 'भुगतान की स्थिति', en: 'Payment Status' },
  order_send_whatsapp: { hi: 'WhatsApp पर ऑर्डर भेजें', en: 'Send Order on WhatsApp' },
  order_view_my_orders: { hi: 'मेरे ऑर्डर देखें', en: 'View My Orders' },

  // सामान्य
  loading: { hi: 'लोड हो रहा है...', en: 'Loading...' },
  order_not_found: { hi: 'ऑर्डर नहीं मिला', en: 'Order not found' },

  // मेरे ऑर्डर (OrderHistory)
  oh_title: { hi: 'मेरे ऑर्डर', en: 'My Orders' },
  oh_phone_ph: { hi: 'मोबाइल नंबर डालें', en: 'Enter mobile number' },
  oh_order_no_ph: { hi: 'अपना कोई ऑर्डर नंबर डालें (जैसे AKS-...)', en: 'Enter any one of your order numbers (e.g. AKS-...)' },
  oh_view: { hi: 'देखें', en: 'View' },
  oh_security_note: { hi: 'आपकी जानकारी की सुरक्षा के लिए ऑर्डर नंबर भी पूछा जाता है। यह आपको ऑर्डर की पुष्टि में मिला था।', en: 'For your security we also ask for an order number. You received it in your order confirmation.' },
  oh_err_bad_input: { hi: 'सही मोबाइल नंबर और ऑर्डर नंबर डालें।', en: 'Enter a valid mobile number and order number.' },
  oh_err_mismatch: { hi: 'ये दोनों मेल नहीं खाते। मोबाइल नंबर और ऑर्डर नंबर दोबारा जाँचें।', en: "These two don't match. Please check the mobile number and order number again." },
  oh_err_none_available: { hi: 'इस ऑर्डर की कोई सब्ज़ी अभी उपलब्ध नहीं है।', en: 'None of the vegetables in this order are available right now.' },
  oh_items: { hi: 'वस्तुएँ', en: 'items' },
  oh_payment: { hi: 'भुगतान', en: 'Payment' },
  oh_details: { hi: 'विवरण देखें', en: 'View details' },
  oh_reorder: { hi: 'दोबारा ऑर्डर करें', en: 'Order again' },

  // विक्रेता
  vendors_title: { hi: 'हमारे विक्रेता', en: 'Our Vendors' },
  vendors_subtitle: { hi: 'किसी विक्रेता पर टैप करके उसकी सब्ज़ियाँ देखें', en: 'Tap a vendor to see their vegetables' },
  vendors_none: { hi: 'अभी तक कोई विक्रेता उपलब्ध नहीं', en: 'No vendors available yet' },
  vendor_unavailable: { hi: 'यह विक्रेता उपलब्ध नहीं है', en: 'This vendor is not available' },
  vendor_all_long: { hi: '← सभी विक्रेता देखें', en: '← View all vendors' },
  vendor_all_short: { hi: '← सभी विक्रेता', en: '← All vendors' },
  vendor_no_veg: { hi: 'इस विक्रेता के पास अभी कोई सब्ज़ी उपलब्ध नहीं है', en: 'This vendor has no vegetables available right now' },

  // छोटे कॉम्पोनेंट
  call_help: { hi: 'सहायता के लिए कॉल करें', en: 'Call for help' },
  category_all_veg: { hi: 'सभी सब्ज़ियाँ', en: 'All vegetables' },
  watcher_title: { hi: 'आपके ऑर्डर की स्थिति बदली', en: 'Your order status changed' },
  watcher_close: { hi: 'बंद करें', en: 'Close' },
  watcher_view: { hi: 'ऑर्डर देखें', en: 'View order' },

  // चेकआउट / ऑर्डर-पुष्टि के बचे हुए टेक्स्ट
  err_date_invalid: { hi: 'सही तारीख चुनें', en: 'Select a valid date' },
  checkout_coupon_min: { hi: 'इस कूपन के लिए न्यूनतम ऑर्डर {amount} होना चाहिए', en: 'This coupon needs a minimum order of {amount}' },
  checkout_coupon_applied: { hi: '✅ कूपन लागू हुआ! आपको {amount} की छूट मिली', en: '✅ Coupon applied! You saved {amount}' },
  order_pending_heading: { hi: 'ऑर्डर बन गया — भुगतान बाकी', en: 'Order created — payment pending' },
  order_payment_due: { hi: 'भुगतान बाकी है', en: 'Payment pending' },
  order_pay_now: { hi: '{amount} अभी भुगतान करें', en: 'Pay {amount} now' },

  // AI ऑर्डर सहायक
  ai_greeting: { hi: 'नमस्ते! 🙏 मुझे बताएं आपको कौन सी सब्ज़ी और कितनी चाहिए — जैसे "2 किलो आलू और 1 किलो टमाटर"। आप टाइप कर सकते हैं या 🎤 दबाकर बोल भी सकते हैं।', en: 'Hello! 🙏 Tell me which vegetables and how much you need — e.g. "2 kg potato and 1 kg tomato". You can type, or tap 🎤 and speak.' },
  ai_btn: { hi: 'AI से ऑर्डर करें', en: 'Order with AI' },
  ai_title: { hi: 'AI ऑर्डर सहायक', en: 'AI Order Assistant' },
  ai_subtitle: { hi: 'सब्ज़ी बोलें या टाइप करें', en: 'Speak or type your vegetables' },
  ai_thinking: { hi: 'सोच रहा हूं...', en: 'Thinking...' },
  ai_your_order: { hi: 'आपका ऑर्डर:', en: 'Your order:' },
  ai_total: { hi: 'कुल राशि', en: 'Total' },
  ai_cancel: { hi: '❌ रद्द करें', en: '❌ Cancel' },
  ai_confirm: { hi: '✅ ऑर्डर कन्फर्म करें', en: '✅ Confirm order' },
  ai_ph_idle: { hi: 'जैसे: 2 किलो आलू देना', en: 'e.g. 2 kg potatoes please' },
  ai_ph_listening: { hi: 'बोलिए... (रुकने के लिए 🎤 दबाएं)', en: 'Speak... (tap 🎤 to stop)' },
  ai_ph_transcribing: { hi: 'आवाज़ समझी जा रही है...', en: 'Understanding your voice...' },
  ai_err_mic: { hi: 'माइक की अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग में माइक को अनुमति दें।', en: 'Microphone permission was denied. Please allow the microphone in your browser settings.' },
  ai_err_voice: { hi: 'आवाज़ समझने में गड़बड़ी हुई। कृपया दोबारा प्रयास करें।', en: 'Could not understand the voice. Please try again.' },
  ai_err_generic: { hi: 'माफ़ करें, कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें।', en: 'Sorry, something went wrong. Please try again.' },
  ai_cancelled: { hi: 'ठीक है, ऑर्डर रद्द कर दिया। कुछ और चाहिए तो बताएं।', en: 'Okay, the order has been cancelled. Tell me if you need anything else.' },
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

// "2 किलो" / "500 ग्राम" जैसे जुड़े हुए टेक्स्ट में सिर्फ़ यूनिट का शब्द बदलता है (लंबे शब्द पहले: "आधा किलो" से पहले "किलो" नहीं)
export function translateUnitText(value, lang) {
  if (lang !== 'en' || typeof value !== 'string') return value
  let out = value
  Object.keys(unitMap).sort((a, b) => b.length - a.length).forEach((hi) => {
    out = out.split(hi).join(unitMap[hi].en)
  })
  return out
}

// React के बाहर (utils) के संदेशों के लिए: चुनी हुई भाषा localStorage से (LanguageContext वही key लिखता है)
export function currentLanguage() {
  try { return localStorage.getItem('aks_language') === 'en' ? 'en' : 'hi' } catch { return 'hi' }
}
export function bi(hi, en) {
  return currentLanguage() === 'en' ? en : hi
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
