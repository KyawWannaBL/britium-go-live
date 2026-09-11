import React from 'react';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';

export interface OrderData {
  trackingNumber: string;
  recipientName: string;
  address: string;
  routeCode: string; // e.g., YGN-TWE
  codAmount: number;
}

export const ShippingLabel: React.FC<{ data: OrderData }> = ({ data }) => {
  return (
    <div className="w-[4in] h-[6in] p-4 bg-white border border-gray-200 box-border flex flex-col justify-between">
      <div className="flex justify-between items-start border-b-2 border-black pb-2">
        <div>
          <h1 className="text-3xl font-bold font-sans tracking-tighter">{data.routeCode}</h1>
          <p className="text-sm font-semibold mt-1">STANDARD DELIVERY</p>
        </div>
        <QRCodeSVG value={data.trackingNumber} size={64} level="H" />
      </div>

      <div className="flex-1 py-4 flex flex-col gap-2">
        <div>
          <p className="text-xs text-gray-500 font-bold uppercase">Deliver To</p>
          <p className="text-lg font-bold">{data.recipientName}</p>
          <p className="text-sm leading-tight text-balance">{data.address}</p>
        </div>
        <div className="mt-auto">
          <p className="text-xs text-gray-500 font-bold uppercase">COD Amount</p>
          <p className="text-xl font-bold">Ks {data.codAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="border-t-2 border-black pt-2 flex flex-col items-center justify-center">
        <Barcode value={data.trackingNumber} width={2} height={60} fontSize={14} margin={0} displayValue={true} />
      </div>
    </div>
  );
};
