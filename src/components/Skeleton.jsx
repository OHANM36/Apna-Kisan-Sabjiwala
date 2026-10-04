import { useLanguage } from '../context/LanguageContext'

// स्केलेटन लोडिंग — डेटा आने तक पेज का ढाँचा दिखाता है (स्पिनर की जगह)
// हल्का रखा गया है: सिर्फ़ CSS pulse, कोई भारी shimmer/gradient नहीं (सस्ते Android फ़ोन के लिए)

/** एक धूसर पट्टी/ब्लॉक — className से साइज़ और आकार तय करें */
export function Bone({ className = '' }) {
  return <div className={`bg-gray-200 rounded ${className}`} aria-hidden="true" />
}

/** पूरे स्केलेटन को लपेटता है: pulse एनिमेशन + स्क्रीन-रीडर के लिए "लोड हो रहा है" */
export function SkeletonWrap({ children, className = '', label }) {
  const { t } = useLanguage()
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={`animate-pulse ${className}`}>
      <span className="sr-only">{label ?? t('loading')}</span>
      {children}
    </div>
  )
}

/* ───────────── ग्राहक ऐप ───────────── */

export function VegetableCardSkeleton() {
  return (
    <div className="card overflow-hidden flex flex-col" aria-hidden="true">
      <div className="aspect-square bg-gray-200" />
      <div className="p-2 pt-2 flex flex-col gap-1.5">
        <Bone className="h-3 w-12 rounded-md" />
        <Bone className="h-3.5 w-3/4" />
        <Bone className="h-4 w-1/2" />
        <Bone className="h-7 w-full rounded-lg mt-1" />
      </div>
    </div>
  )
}

export function VegetableGridSkeleton({ count = 6, cols = 2, label }) {
  const gridCols = cols === 3 ? 'grid-cols-3' : 'grid-cols-2'
  return (
    <SkeletonWrap label={label} className={`grid ${gridCols} gap-2.5 pb-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <VegetableCardSkeleton key={i} />
      ))}
    </SkeletonWrap>
  )
}

/** Home पेज की बायीं श्रेणी-पट्टी के अंदर के आइटम */
export function CategorySidebarSkeleton({ count = 6 }) {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 py-3 px-1 border-l-4 border-transparent">
          <Bone className="w-11 h-11 rounded-full" />
          <Bone className="h-2 w-9" />
        </div>
      ))}
    </div>
  )
}

export function CategoryGridSkeleton({ count = 8 }) {
  return (
    <SkeletonWrap className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 flex flex-col items-center gap-2">
          <Bone className="w-12 h-12 rounded-full" />
          <Bone className="h-3.5 w-20" />
        </div>
      ))}
    </SkeletonWrap>
  )
}

export function VendorGridSkeleton({ count = 6 }) {
  return (
    <SkeletonWrap className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 flex flex-col items-center gap-2">
          <Bone className="w-16 h-16 rounded-full" />
          <Bone className="h-3.5 w-24" />
          <Bone className="h-3 w-16" />
        </div>
      ))}
    </SkeletonWrap>
  )
}

/** VendorDetail: विक्रेता का हेडर + सब्ज़ियों का 3-कॉलम ग्रिड */
export function VendorDetailSkeleton() {
  return (
    <SkeletonWrap className="px-4 py-4">
      <Bone className="h-4 w-24 mb-3" />
      <div className="flex items-center gap-3 mb-5">
        <Bone className="w-16 h-16 rounded-full shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Bone className="h-5 w-40" />
          <Bone className="h-3.5 w-24" />
          <Bone className="h-3 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <VegetableCardSkeleton key={i} />
        ))}
      </div>
    </SkeletonWrap>
  )
}

/** ग्राहक की ऑर्डर सूची (OrderHistory) */
export function OrderCardListSkeleton({ count = 2 }) {
  return (
    <SkeletonWrap className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex flex-col gap-2">
              <Bone className="h-4 w-32" />
              <Bone className="h-3 w-20" />
            </div>
            <Bone className="h-6 w-16 rounded-full" />
          </div>
          <Bone className="h-3 w-3/4 mb-3" />
          <div className="flex gap-2">
            <Bone className="h-8 flex-1 rounded-lg" />
            <Bone className="h-8 flex-1 rounded-lg" />
          </div>
        </div>
      ))}
    </SkeletonWrap>
  )
}

/** OrderConfirmation: स्थिति + आइटम + कुल */
export function OrderConfirmationSkeleton() {
  return (
    <SkeletonWrap className="px-4 py-5 flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2">
        <Bone className="w-16 h-16 rounded-full" />
        <Bone className="h-5 w-48" />
        <Bone className="h-3.5 w-32" />
      </div>
      <div className="card p-4 flex flex-col gap-3">
        <Bone className="h-4 w-28" />
        <div className="flex justify-between">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="w-8 h-8 rounded-full" />
          ))}
        </div>
      </div>
      <div className="card p-4 flex flex-col gap-3">
        <Bone className="h-4 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Bone className="h-3.5 w-1/2" />
            <Bone className="h-3.5 w-14" />
          </div>
        ))}
        <div className="border-t border-gray-100 pt-3 flex justify-between">
          <Bone className="h-4 w-16" />
          <Bone className="h-4 w-20" />
        </div>
      </div>
    </SkeletonWrap>
  )
}

/** Cart/Checkout जैसे पेज के लिए: कुछ आइटम-पंक्तियाँ + बिल */
export function CartSkeleton() {
  return (
    <SkeletonWrap className="px-4 py-4 flex flex-col gap-3">
      <Bone className="h-5 w-32 mb-1" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card p-3 flex items-center gap-3">
          <Bone className="w-16 h-16 rounded-xl shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <Bone className="h-4 w-2/3" />
            <Bone className="h-3.5 w-1/3" />
          </div>
          <Bone className="h-8 w-20 rounded-lg" />
        </div>
      ))}
      <div className="card p-4 flex flex-col gap-2.5">
        <div className="flex justify-between"><Bone className="h-3.5 w-20" /><Bone className="h-3.5 w-14" /></div>
        <div className="flex justify-between"><Bone className="h-3.5 w-24" /><Bone className="h-3.5 w-12" /></div>
        <div className="flex justify-between"><Bone className="h-4 w-16" /><Bone className="h-4 w-16" /></div>
      </div>
    </SkeletonWrap>
  )
}

/** फ़ॉर्म वाले पेज (Checkout, सेटिंग्स) */
export function FormSkeleton({ fields = 4, className = '' }) {
  return (
    <SkeletonWrap className={`flex flex-col gap-4 ${className}`}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bone className="h-3.5 w-28" />
          <Bone className="h-12 w-full rounded-2xl" />
        </div>
      ))}
    </SkeletonWrap>
  )
}

/* ───────────── एडमिन / विक्रेता / डिलीवरी पैनल ───────────── */

/** पेज का शीर्षक (h1) + वैकल्पिक बटन की जगह */
export function TitleBone({ withButton = false }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <Bone className="h-6 w-44" />
      {withButton && <Bone className="h-9 w-32 rounded-2xl" />}
    </div>
  )
}

/** रंगीन आँकड़ा-कार्ड (डैशबोर्ड/रिपोर्ट) */
export function StatCardsSkeleton({ count = 4, cols = 'grid-cols-2 md:grid-cols-3', className = 'mb-6' }) {
  return (
    <div className={`grid ${cols} gap-4 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-7 w-24" />
        </div>
      ))}
    </div>
  )
}

/** सफ़ेद कार्ड की सूची (ऑर्डर, ग्राहक, विक्रेता, डिलीवरी बॉय) */
export function ListCardsSkeleton({ count = 4, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <Bone className="h-4 w-36" />
              <Bone className="h-3 w-48 max-w-full" />
              <Bone className="h-3 w-24" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <Bone className="h-4 w-16" />
              <Bone className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** चिप/फ़िल्टर की पंक्ति */
export function ChipsSkeleton({ count = 4 }) {
  return (
    <div className="flex gap-2 mb-4 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Bone key={i} className="h-8 w-20 rounded-full shrink-0" />
      ))}
    </div>
  )
}

/** टेबल (सब्ज़ी/श्रेणी प्रबंधन) */
export function TableSkeleton({ cols = 5, rows = 6 }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden" aria-hidden="true">
      <div className="bg-gray-50 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Bone key={i} className="h-3 flex-1 bg-gray-300/70" />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3.5 flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Bone key={c} className={`h-4 flex-1 ${c === 0 ? 'max-w-[40%]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** एक साधारण पैनल-पेज: शीर्षक + कुछ कार्ड — जब पेज का सही आकार पता न हो (Suspense fallback आदि) */
export function PageSkeleton({ withButton = false, cards = 3 }) {
  return (
    <SkeletonWrap>
      <TitleBone withButton={withButton} />
      <ListCardsSkeleton count={cards} />
    </SkeletonWrap>
  )
}

/** सेटिंग/फ़ॉर्म वाला पैनल-पेज */
export function SettingsPageSkeleton({ rows = 3 }) {
  return (
    <SkeletonWrap className="max-w-xl">
      <Bone className="h-6 w-40 mb-2" />
      <Bone className="h-3.5 w-3/4 mb-5" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4 mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <Bone className="h-4 w-40" />
            <Bone className="h-3 w-3/4" />
          </div>
          <Bone className="h-7 w-12 rounded-full shrink-0" />
        </div>
      ))}
    </SkeletonWrap>
  )
}

/** डैशबोर्ड: आँकड़े + स्थिति-कार्ड + हाल के ऑर्डर */
export function DashboardSkeleton({ stages = true }) {
  return (
    <SkeletonWrap>
      <Bone className="h-6 w-32 mb-5" />
      <StatCardsSkeleton count={5} />
      {stages && (
        <>
          <Bone className="h-5 w-36 mb-3" />
          <StatCardsSkeleton count={5} cols="grid-cols-2 md:grid-cols-5" className="mb-6 gap-3" />
        </>
      )}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <Bone className="h-5 w-32 mb-4" />
        <div className="flex flex-col divide-y divide-gray-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="py-3 flex justify-between items-center">
              <div className="flex flex-col gap-2">
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-40" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Bone className="h-4 w-14" />
                <Bone className="h-4 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonWrap>
  )
}

/** लॉगिन-जाँच के दौरान पूरा एडमिन ढाँचा (साइडबार + कंटेंट) */
export function AdminShellSkeleton() {
  const { t } = useLanguage()
  return (
    <div className="min-h-screen bg-gray-50 md:flex" role="status" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <aside className="md:w-60 bg-kisan-dark md:min-h-screen">
        <div className="p-5 flex items-center gap-2 border-b border-white/10 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-white/20 shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-3.5 w-28 rounded bg-white/20" />
            <div className="h-2.5 w-16 rounded bg-white/10" />
          </div>
        </div>
        <div className="flex md:flex-col gap-2 p-3 overflow-hidden animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-28 md:w-full rounded-lg bg-white/10 shrink-0" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-6">
        <PageSkeleton withButton />
      </main>
    </div>
  )
}

/** विक्रेता/डिलीवरी पैनल का ढाँचा (ऊपर हरी पट्टी + कंटेंट) */
export function SimpleShellSkeleton() {
  const { t } = useLanguage()
  return (
    <div className="min-h-screen bg-gray-50" role="status" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <div className="bg-kisan-dark p-4 flex items-center gap-2 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-white/20 shrink-0" />
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 w-28 rounded bg-white/20" />
          <div className="h-2.5 w-16 rounded bg-white/10" />
        </div>
      </div>
      <main className="p-4">
        <PageSkeleton />
      </main>
    </div>
  )
}

/* ───────────── पूरे पेज के तैयार स्केलेटन (पैनल के पेज इन्हें सीधे इस्तेमाल करते हैं) ───────────── */

/** शीर्षक + (खोज/टूलबार) + चिप-पंक्तियाँ + कार्ड-सूची */
export function ListPageSkeleton({ withButton = false, chips = 0, search = false, toolbar = false, count = 4 }) {
  return (
    <SkeletonWrap>
      <TitleBone withButton={withButton} />
      {search && <Bone className="h-12 w-full max-w-sm rounded-2xl mb-4" />}
      {toolbar && (
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex flex-col md:flex-row gap-3">
          <Bone className="h-12 flex-1 rounded-2xl" />
          <Bone className="h-12 flex-1 rounded-2xl" />
        </div>
      )}
      {Array.from({ length: chips }).map((_, i) => (
        <ChipsSkeleton key={i} count={i === 0 ? 4 : 5} />
      ))}
      <ListCardsSkeleton count={count} />
    </SkeletonWrap>
  )
}

/** शीर्षक + टेबल */
export function TablePageSkeleton({ cols = 5, rows = 6 }) {
  return (
    <SkeletonWrap>
      <TitleBone withButton />
      <TableSkeleton cols={cols} rows={rows} />
    </SkeletonWrap>
  )
}

/** शीर्षक + सिर्फ़ आँकड़ा-कार्ड (विक्रेता डैशबोर्ड) */
export function StatsPageSkeleton({ count = 4, cols = 'grid-cols-2' }) {
  return (
    <SkeletonWrap>
      <TitleBone />
      <StatCardsSkeleton count={count} cols={cols} />
    </SkeletonWrap>
  )
}

/** बिक्री रिपोर्ट: आँकड़े + नीचे विवरण-कार्ड */
export function ReportsSkeleton() {
  return (
    <SkeletonWrap>
      <TitleBone />
      <StatCardsSkeleton count={7} />
      <ListCardsSkeleton count={2} />
    </SkeletonWrap>
  )
}

/** शीर्षक + विवरण + फ़ॉर्म-कार्ड (वेलकम पॉपअप, किसी एक आइटम का एडिट पेज) */
export function FormPageSkeleton({ fields = 4 }) {
  return (
    <SkeletonWrap>
      <Bone className="h-6 w-48 mb-3" />
      <Bone className="h-3.5 w-full max-w-md mb-5" />
      <div className="bg-white rounded-2xl shadow-sm p-5 max-w-lg">
        <FormSkeleton fields={fields} />
      </div>
    </SkeletonWrap>
  )
}

/** नया मोबाइल डैशबोर्ड: मुख्य कार्ड + 2-कॉलम आँकड़े + चिप्स + सूची (AdminDashboard के ढाँचे जैसा) */
export function AdminDashboardSkeleton() {
  return (
    <SkeletonWrap>
      <Bone className="h-6 w-32 mb-2" />
      <Bone className="h-3.5 w-48 mb-4" />
      <div className="admin-stat-grid" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`bg-white border border-gray-100 rounded-2xl p-3 flex items-center gap-3 ${i === 0 ? 'col-span-2 md:col-span-1 h-[72px]' : ''}`}>
            <Bone className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <Bone className="h-3 w-16" />
              <Bone className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
      <Bone className="h-5 w-32 mt-6 mb-3" />
      <div className="admin-tile-row" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-16 rounded-xl" />)}
      </div>
      <Bone className="h-5 w-32 mt-6 mb-3" />
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex justify-between"><Bone className="h-4 w-28" /><Bone className="h-4 w-14" /></div>
            <div className="flex justify-between"><Bone className="h-3 w-36" /><Bone className="h-4 w-16 rounded-full" /></div>
            <Bone className="h-3 w-24" />
          </div>
        ))}
      </div>
    </SkeletonWrap>
  )
}

/** ऑर्डर पेज: शीर्षक + सर्च + चिप्स + ऑर्डर कार्ड (AdminOrders के ढाँचे जैसा) */
export function OrdersSkeleton({ count = 3 }) {
  return (
    <SkeletonWrap>
      <Bone className="h-6 w-24 mb-2" />
      <Bone className="h-3.5 w-40 mb-4" />
      <Bone className="h-11 w-full rounded-xl mb-3" />
      <div className="flex gap-2 mb-4 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-10 w-20 rounded-full shrink-0" />)}
      </div>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col gap-2.5">
            <div className="flex justify-between"><Bone className="h-4 w-32" /><Bone className="h-5 w-16" /></div>
            <Bone className="h-3.5 w-44" />
            <div className="flex gap-2"><Bone className="h-5 w-24 rounded-full" /><Bone className="h-5 w-20 rounded-full" /></div>
            <Bone className="h-3.5 w-full" />
            <div className="flex gap-2 mt-1"><Bone className="h-11 flex-1 rounded-xl" /><Bone className="h-11 w-24 rounded-xl" /><Bone className="h-11 w-11 rounded-xl" /></div>
          </div>
        ))}
      </div>
    </SkeletonWrap>
  )
}
