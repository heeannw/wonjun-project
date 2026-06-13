import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useProfileStore = create((set, get) => ({
  profile: null,

  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from('athlete_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()
    set({ profile: data || null })
  },

  setProfile: (profile) => set({ profile }),
}))
