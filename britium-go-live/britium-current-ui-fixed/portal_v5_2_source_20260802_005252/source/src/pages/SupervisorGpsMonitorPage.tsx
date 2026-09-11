import SupervisorLiveMapMonitor from "@/components/supervisor/SupervisorLiveMapMonitor";

export default function SupervisorGpsMonitorPage() {
  return (
    <div className="min-h-screen bg-[#061524] p-4 text-[#eef8ff] md:p-8">
      <div className="mx-auto max-w-[1600px]">
        <SupervisorLiveMapMonitor />
      </div>
    </div>
  );
}
