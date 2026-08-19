import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatRupee, formatDate } from '../utils/format'
import Loading from '../components/Loading'

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [ordersByCustomer, setOrdersByCustomer] = useState({})

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    setCustomers(data || [])
    setLoading(false)
  }

  async function toggleExpand(customer) {
    if (expanded === customer.id) {
      setExpanded(null)
      return
    }
    setExpanded(customer.id)
    if (!ordersByCustomer[customer.id]) {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
      setOrdersByCustomer((prev) => ({ ...prev, [customer.id]: data || [] }))
    }
  }

  const filtered = customers.filter(
    (c) => c.full_name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">ग्राहक प्रबंधन</h1>

      <input
        className="input-field mb-4 max-w-sm"
        placeholder="नाम या मोबाइल नंबर से खोजें"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex flex-col gap-3">
        {filtered.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleExpand(c)}>
              <div>
                <p className="font-bold text-gray-800 text-sm">{c.full_name}</p>
                <p className="text-xs text-gray-500">{c.phone}</p>
              </div>
              <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
            </div>

            {expanded === c.id && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">ऑर्डर इतिहास</p>
                {(ordersByCustomer[c.id] || []).map((o) => (
                  <div key={o.id} className="flex justify-between text-xs text-gray-600 py-1">
                    <span>{o.order_number} • {o.order_status}</span>
                    <span>{formatRupee(o.total_amount)}</span>
                  </div>
                ))}
                {ordersByCustomer[c.id]?.length === 0 && <p className="text-xs text-gray-400">कोई ऑर्डर नहीं</p>}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-gray-400 text-center py-10">कोई ग्राहक नहीं मिला</p>}
      </div>
    </div>
  )
}
