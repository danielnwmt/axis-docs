import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { setAppLanguage, SupportedLanguage, SUPPORTED_LANGUAGES } from "@/i18n";

const loadUserLanguage = async (userId: string) => {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("language")
      .eq("id", userId)
      .maybeSingle();
    const lang = (data as any)?.language as SupportedLanguage | undefined;
    if (lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
      setAppLanguage(lang);
    }
  } catch {}
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Timeout to prevent infinite white screen if backend is unreachable
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("Auth timeout: backend may be unreachable");
        setLoading(false);
      }
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        clearTimeout(timeout);
        if (session?.user?.id) {
          setTimeout(() => loadUserLanguage(session.user.id), 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      clearTimeout(timeout);
      if (session?.user?.id) {
        loadUserLanguage(session.user.id);
      }
    }).catch(() => {
      setLoading(false);
      clearTimeout(timeout);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
