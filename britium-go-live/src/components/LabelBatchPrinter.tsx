import React from 'react';
import { ShippingLabel, OrderData } from './ShippingLabel';

interface LabelBatchPrinterProps {
  orders: OrderData[];
}

export const LabelBatchPrinter: React.FC<LabelBatchPrinterProps> = ({ orders }) => {
  return (
    <div className="print:m-0 print:p-0 bg-gray-100 p-8 min-h-screen flex flex-col items-center gap-8">
      <button 
        onClick={() => window.print()}
        className="no-print mb-4 px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700"
      >
        Print Batch ({orders.length} Labels)
      </button>

      <div className="flex flex-col gap-8 print:gap-0">
        {orders.map((order) => (
          <div key={order.trackingNumber} className="print:break-after-page shadow-md print:shadow-none">
            <ShippingLabel data={order} />
          </div>
        ))}
      </div>
    </div>
  );
};
