import React, { createContext, useContext, useEffect, useState } from 'react'
import { translate, translateStatus, translateTimeSlot, pickLocalizedName } from '../utils/translations'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'aks_language'

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'hi'
    } catch {
      return 'hi'
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  function setLanguage(lang) {
    setLanguageState(lang)
  }

  function toggleLanguage() {
    setLanguageState((prev) => (prev === 'hi' ? 'en' : 'hi'))
  }

  function t(key) {
    return translate(key, language)
  }

  function tStatus(value) {
    return translateStatus(value, language)
  }

  function tTimeSlot(value) {
    return translateTimeSlot(value, language)
  }

  function tName(record) {
    return pickLocalizedName(record, language)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t, tStatus, tTimeSlot, tName }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage का उपयोग LanguageProvider के अंदर करें')
  return ctx
}
