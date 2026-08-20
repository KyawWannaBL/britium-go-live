// @ts-nocheck
export const goLivePrintApi = {
  printWaybill: async (id: string) => ({ success: true, id }),
  printBatch: async (ids: string[]) => ({ success: true, count: ids.length }),
};

export default goLivePrintApi;
