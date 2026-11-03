// Live wrapper for Finance Portal.
// Backend source is loaded inside EnterpriseLiveCenterPages through:
// supabase.rpc("be_finance_portal_center")

import {FinancePortalLivePage} from './EnterpriseLiveCenterPages';
import BranchFinanceOversight from '@/components/finance/BranchFinanceOversight';
import {CorporateFinanceReviewPanel} from '@/components/tariff/CorporateTariffPanel';
export default function FinancePortalPage(){
 return <><BranchFinanceOversight/><CorporateFinanceReviewPanel/><FinancePortalLivePage/></>;
}
