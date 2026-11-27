import ProviderCustodyForm from "@/components/parcel/ProviderCustodyForm";
import ProviderTransferPanel from "@/components/parcel/ProviderTransferPanel";

export default function ProviderCustodyPage() {
  return (
    <main className="mx-auto max-w-screen-xl space-y-4 p-4 text-slate-100">
      <h1 className="text-2xl font-bold">Provider Custody</h1>
      <ProviderTransferPanel />
      <ProviderCustodyForm />
    </main>
  );
}
