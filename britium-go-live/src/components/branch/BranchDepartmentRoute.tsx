import type {ReactNode} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {normalizeRole} from '@/lib/portalRegistry';
import BranchDepartmentPage,{type Department} from './BranchDepartmentPage';
export default function BranchDepartmentRoute({module,children}:{module:Department;children:ReactNode}){
 const {profile}=useAuth();
 if(normalizeRole(profile?.role)!=='branch-manager')return <>{children}</>;
 const branch=String(profile?.branch_code||'').trim().toUpperCase();
 return <BranchDepartmentPage key={`${branch}:${module}`} module={module} branch={branch}/>;
}
