import React from "react";
import OperationalModuleDashboard from "../components/OperationalModuleDashboard";

export default function GenericRolePortalPage({ title, code, titleEn, titleMm, moduleCode, portalName, portalCode }: any) {
  const name = title || titleEn || portalName || "Operational Module";
  const codeValue = code || moduleCode || portalCode || "module";
  return <OperationalModuleDashboard titleEn={name} titleMm={titleMm || name} moduleCode={codeValue} />;
}
