import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User, EmployeeRole, RoutePath } from '@/lib/index';
import { ROUTE_PATHS } from '@/lib/index';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, fullName: string, role?: EmployeeRole) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: EmployeeRole | EmployeeRole[]) => boolean;
  canAccessPortal: (portal: RoutePath) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_PORTAL_ACCESS: Record<EmployeeRole, RoutePath[]> = {
  'super-admin': [
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.SUPERVISOR,
    ROUTE_PATHS.DRIVER,
    ROUTE_PATHS.WAREHOUSE,
    ROUTE_PATHS.CUSTOMER_SERVICE,
    ROUTE_PATHS.CREATE_DELIVERY,
    ROUTE_PATHS.QR_CODE,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.DATA_ENTRY,
    ROUTE_PATHS.WAYPLAN,
    ROUTE_PATHS.MARKETING,
    ROUTE_PATHS.HR,
    ROUTE_PATHS.FINANCE,
    ROUTE_PATHS.MERCHANT,
    ROUTE_PATHS.CUSTOMER,
    ROUTE_PATHS.SETTINGS,
  ],
  'admin': [
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.SUPERVISOR,
    ROUTE_PATHS.DRIVER,
    ROUTE_PATHS.WAREHOUSE,
    ROUTE_PATHS.CUSTOMER_SERVICE,
    ROUTE_PATHS.CREATE_DELIVERY,
    ROUTE_PATHS.QR_CODE,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.DATA_ENTRY,
    ROUTE_PATHS.WAYPLAN,
    ROUTE_PATHS.SETTINGS,
  ],
  'branch-office': [
    ROUTE_PATHS.BRANCH_OFFICE,
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.SUPERVISOR,
    ROUTE_PATHS.DRIVER,
    ROUTE_PATHS.WAREHOUSE,
    ROUTE_PATHS.CUSTOMER_SERVICE,
    ROUTE_PATHS.CREATE_DELIVERY,
    ROUTE_PATHS.QR_CODE,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.DATA_ENTRY,
    ROUTE_PATHS.WAYPLAN,
    ROUTE_PATHS.FINANCE,
    ROUTE_PATHS.SETTINGS,
  ],
  'supervisor': [
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.SUPERVISOR,
    ROUTE_PATHS.CREATE_DELIVERY,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.SETTINGS,
  ],
  'wayplan-manager': [
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.WAYPLAN,
    ROUTE_PATHS.SUPERVISOR,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.SETTINGS,
  ],
  'driver': [
    ROUTE_PATHS.DRIVER,
    ROUTE_PATHS.QR_CODE,
    ROUTE_PATHS.SETTINGS,
  ],
  'rider': [
    ROUTE_PATHS.DRIVER,
    ROUTE_PATHS.QR_CODE,
    ROUTE_PATHS.SETTINGS,
  ],
  'warehouse-staff': [
    ROUTE_PATHS.WAREHOUSE,
    ROUTE_PATHS.QR_CODE,
    ROUTE_PATHS.SETTINGS,
  ],
  'customer-service': [
    ROUTE_PATHS.CUSTOMER_SERVICE,
    ROUTE_PATHS.CREATE_DELIVERY,
    ROUTE_PATHS.SETTINGS,
  ],
  'data-entry': [
    ROUTE_PATHS.DATA_ENTRY,
    ROUTE_PATHS.CREATE_DELIVERY,
    ROUTE_PATHS.SETTINGS,
  ],
  'marketing': [
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.MARKETING,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.CUSTOMER,
    ROUTE_PATHS.SETTINGS,
  ],
  'hr-admin': [
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.HR,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.SETTINGS,
  ],
  'finance': [
    ROUTE_PATHS.DASHBOARD,
    ROUTE_PATHS.FINANCE,
    ROUTE_PATHS.ANALYTICS,
    ROUTE_PATHS.SETTINGS,
  ],
  'merchant': [
    ROUTE_PATHS.MERCHANT,
    ROUTE_PATHS.SETTINGS,
  ],
  'customer': [
    ROUTE_PATHS.CUSTOMER,
    ROUTE_PATHS.SETTINGS,
  ],
};

const ROLE_PERMISSIONS: Record<EmployeeRole, string[]> = {
  'super-admin': ['view:all', 'create:all', 'update:all', 'delete:all', 'manage:users', 'manage:settings'],
  'admin': ['view:dashboard', 'view:deliveries', 'create:deliveries', 'update:deliveries', 'view:analytics', 'manage:warehouse'],
  'branch-office': ['view:dashboard', 'view:deliveries', 'create:deliveries', 'update:deliveries', 'view:team', 'view:routes', 'create:routes', 'update:routes', 'view:inventory', 'update:inventory', 'scan:qr', 'manage:inbound', 'manage:outbound', 'view:customers', 'handle:complaints', 'bulk:upload', 'view:analytics', 'view:transactions', 'manage:cod', 'create:invoices', 'view:attendance', 'view:employees', 'view:reports', 'optimize:routes'],
  'supervisor': ['view:dashboard', 'view:deliveries', 'view:team', 'view:analytics'],
  'wayplan-manager': ['view:dashboard', 'view:routes', 'create:routes', 'update:routes', 'optimize:routes'],
  'driver': ['view:deliveries', 'update:delivery-status', 'scan:qr'],
  'rider': ['view:deliveries', 'update:delivery-status', 'scan:qr'],
  'warehouse-staff': ['view:inventory', 'update:inventory', 'scan:qr', 'manage:inbound', 'manage:outbound'],
  'customer-service': ['view:deliveries', 'create:deliveries', 'view:customers', 'handle:complaints'],
  'data-entry': ['create:deliveries', 'bulk:upload', 'update:deliveries'],
  'marketing': ['view:dashboard', 'view:analytics', 'view:customers', 'create:campaigns'],
  'hr-admin': ['view:employees', 'create:employees', 'update:employees', 'view:attendance', 'manage:leave'],
  'finance': ['view:transactions', 'view:analytics', 'manage:cod', 'create:invoices'],
  'merchant': ['view:shipments', 'create:shipments', 'view:reports'],
  'customer': ['view:orders', 'track:shipments', 'create:support-ticket'],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUserProfile = useCallback(async (supabaseUser: SupabaseUser) => {
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (error) throw error;

      if (profile) {
        const userPermissions = ROLE_PERMISSIONS[profile.role as EmployeeRole] || [];
        
        const appUser: User = {
          id: profile.id,
          email: profile.email,
          name: profile.full_name || profile.email.split('@')[0],
          role: profile.role as EmployeeRole,
          branchId: profile.branch_id || 'default',
          permissions: userPermissions,
          preferences: profile.preferences || {
            language: 'en',
            theme: 'auto',
            notifications: { email: true, push: true, sms: false }
          },
          lastLogin: profile.last_login || new Date().toISOString(),
          createdAt: profile.created_at,
          updatedAt: profile.updated_at || new Date().toISOString(),
        };

        setUser(appUser);

        // Update last login
        await supabase
          .from('user_profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('id', supabaseUser.id);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  const login = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        await loadUserProfile(data.user);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Failed to login');
    }
  };

  const signup = async (email: string, password: string, fullName: string, role: EmployeeRole = 'customer') => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        await loadUserProfile(data.user);
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      throw new Error(error.message || 'Failed to sign up');
    }
  };

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } catch (error: any) {
      console.error('Logout error:', error);
      throw new Error(error.message || 'Failed to logout');
    }
  };

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    return user.permissions.includes(permission) || user.permissions.includes('view:all');
  }, [user]);

  const hasRole = useCallback((role: EmployeeRole | EmployeeRole[]): boolean => {
    if (!user) return false;
    if (Array.isArray(role)) {
      return role.includes(user.role);
    }
    return user.role === role;
  }, [user]);

  const canAccessPortal = useCallback((portal: RoutePath): boolean => {
    if (!user) return false;
    const allowedPortals = ROLE_PORTAL_ACCESS[user.role] || [];
    return allowedPortals.includes(portal);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        signup,
        hasPermission,
        hasRole,
        canAccessPortal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
