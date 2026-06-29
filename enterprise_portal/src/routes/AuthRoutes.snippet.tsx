// Add these routes to your existing React Router setup.
// Adjust import paths if your project folder structure differs.

import PortalLoginPage from "@/pages/PortalLoginPage";
import RiderLoginPage from "@/pages/RiderLoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import SignupPage from "@/pages/SignupPage";
import MustChangePasswordClient from "@/pages/MustChangePasswordClient";

// <Routes>
<Route path="/login" element={<PortalLoginPage />} />
<Route path="/rider-login" element={<RiderLoginPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/signup" element={<SignupPage />} />
<Route path="/must-change-password" element={<MustChangePasswordClient />} />
// </Routes>
