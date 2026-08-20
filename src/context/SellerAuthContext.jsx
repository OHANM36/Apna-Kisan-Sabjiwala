import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const SellerAuthContext = createContext(null)

export function SellerAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [sellerProfile, setSellerProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadSellerProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) loadSellerProfile(newSession.user.id)
      else {
        setSellerProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadSellerProfile(userId) {
    const { data } = await supabase.from('sellers').select('*').eq('id', userId).maybeSingle()
    setSellerProfile(data)
    setLoading(false)
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { data }
  }

  async function signup({ email, password, businessName, ownerName, phone }) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }
    if (!data.session) {
      return {
        error:
          'खाता बना पर तुरंत लॉगिन नहीं हो सका — शायद ईमेल पुष्टि (confirmation) चालू है। एडमिन से संपर्क करें।',
      }
    }
    const { error: profileErr } = await supabase.from('sellers').insert({
      id: data.user.id,
      business_name: businessName,
      owner_name: ownerName,
      phone,
      email,
    })
    if (profileErr) return { error: profileErr.message }
    await loadSellerProfile(data.user.id)
    return { data }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <SellerAuthContext.Provider
      value={{
        session,
        sellerProfile,
        loading,
        login,
        signup,
        logout,
        isSeller: !!sellerProfile,
        isApproved: !!sellerProfile?.is_approved,
      }}
    >
      {children}
    </SellerAuthContext.Provider>
  )
}

export function useSellerAuth() {
  const ctx = useContext(SellerAuthContext)
  if (!ctx) throw new Error('useSellerAuth का उपयोग SellerAuthProvider के अंदर करें')
  return ctx
}
