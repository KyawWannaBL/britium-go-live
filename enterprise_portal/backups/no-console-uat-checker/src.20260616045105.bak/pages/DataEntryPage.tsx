import React from "react";
import BulkTemplateWorkbench from "../components/BulkTemplateWorkbench";

export default function DataEntryPage() {
  return (
    <div className="be-page">
      <BulkTemplateWorkbench module="data_entry" title="Data Entry / Bulk Upload" />
    </div>
  );
}
