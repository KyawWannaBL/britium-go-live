import { Link, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const riderMode = searchParams.get("mode") === "rider";
  const loginPath = riderMode ? "/rider-login" : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A1628] px-4 py-10 text-[#E8F0FE]">
      <section aria-labelledby="account-access-heading" className="w-full max-w-lg rounded-2xl border border-[#1A3050] bg-[#0E1E38] p-6">
        <ShieldCheck aria-hidden="true" className="mb-4 h-10 w-10 text-[#C9A84C]" />
        <h1 id="account-access-heading" className="text-2xl font-bold">Request Britium account access</h1>
        <p className="mt-4 leading-7 text-[#C7D7EE]">
          All Enterprise, Merchant and workforce accounts are created by Britium administrators.
          Contact your Britium administrator to request an account or correct your access.
        </p>
        <a href="mailto:md@britiumventures.com?subject=Britium%20Enterprise%20account%20access"
          className="mt-6 block min-h-12 rounded-xl bg-[#C9A84C] px-4 py-3 text-center font-bold text-[#0A1628]">
          Contact Britium administrator
        </a>
        <p className="mt-4 text-sm leading-6 text-[#C7D7EE]">
          Do not send passwords or verification codes. Opening this link does not create an account.
        </p>
        <Link to={loginPath} className="mt-4 block min-h-12 rounded-xl border border-[#64748B] px-4 py-3 text-center font-bold text-[#E8F0FE]">
          Back to sign in
        </Link>
        <a href="https://www.britiumexpress.com/account-deletion.html" className="mt-4 block min-h-12 px-4 py-3 text-center text-[#E4C87C] underline">
          Request account and data deletion
        </a>
      </section>
    </main>
  );
}
