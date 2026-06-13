import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set) => ({
  user: null,
  appProfile: null,
  role: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setAppProfile: (appProfile) => set({ appProfile, role: appProfile?.role || null }),

  fetchAppProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      set({ appProfile: data || null, role: data?.role || null })
      return data || null
    } catch {
      set({ appProfile: null, role: null })
      return null
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    let appProfile = null
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle()
      appProfile = profileData || null
    } catch {
      appProfile = null
    }
    set({ user: data.user, appProfile, role: appProfile?.role || null })
    return { ...data, appProfile }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, appProfile: null, role: null })
  },
}))
