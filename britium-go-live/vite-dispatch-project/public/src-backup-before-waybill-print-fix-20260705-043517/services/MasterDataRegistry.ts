import BritiumConfig from '../path-to-your-json-file.json'; // Import your provided JSON

export const MasterDataRegistry = {
  // Get a list of allowed values for any dropdown (e.g., 'vehicle_type')
  getDropdown: (name: string) => {
    return BritiumConfig.dropdownValues
      .filter((d: any) => d.dropdown_name === name)
      .map((d: any) => ({ value: d.value, label: d.MyanmarLabel }));
  },

  // Get workflow status rules
  getStatusRules: () => BritiumConfig.processStatusMaster,

  // Get exception validation logic
  getExceptionRules: (code: string) => {
    return BritiumConfig.pickupExceptionMaster.find((e: any) => e.exception_code === code) 
           || BritiumConfig.warehouseExceptionMaster.find((e: any) => e.exception_code === code);
  }
};