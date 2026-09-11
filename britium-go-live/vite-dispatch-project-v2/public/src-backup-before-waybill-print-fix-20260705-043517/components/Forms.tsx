import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronLeft, Package, User, DollarSign, Building2, Truck } from 'lucide-react';
import type { Delivery, Merchant, Deliveryman } from '@/lib/index';

const deliveryFormSchema = z.object({
  merchantId: z.string().min(1, 'Merchant is required'),
  senderName: z.string().min(2, 'Sender name must be at least 2 characters'),
  senderPhone: z.string().min(10, 'Valid phone number required'),
  senderAddress: z.string().min(5, 'Sender address is required'),
  recipientName: z.string().min(2, 'Recipient name must be at least 2 characters'),
  recipientPhone: z.string().min(10, 'Valid phone number required'),
  recipientAddress: z.string().min(5, 'Recipient address is required'),
  recipientTown: z.string().min(2, 'Town is required'),
  packageDescription: z.string().min(3, 'Package description is required'),
  packageWeight: z.number().min(0.1, 'Weight must be greater than 0'),
  packageValue: z.number().min(0, 'Value must be non-negative'),
  deliveryFee: z.number().min(0, 'Delivery fee must be non-negative'),
  codAmount: z.number().optional(),
  notes: z.string().optional(),
});

type DeliveryFormData = z.infer<typeof deliveryFormSchema>;

interface DeliveryFormProps {
  onSubmit: (data: DeliveryFormData) => void;
  initialData?: Partial<Delivery>;
}

export function DeliveryForm({ onSubmit, initialData }: DeliveryFormProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<DeliveryFormData>({
    resolver: zodResolver(deliveryFormSchema),
    defaultValues: {
      merchantId: initialData?.merchantId || '',
      senderName: initialData?.senderName || '',
      senderPhone: initialData?.senderPhone || '',
      senderAddress: initialData?.senderAddress || '',
      recipientName: initialData?.recipientName || '',
      recipientPhone: initialData?.recipientPhone || '',
      recipientAddress: initialData?.recipientAddress || '',
      recipientTown: initialData?.recipientTown || '',
      packageDescription: initialData?.packageDescription || '',
      packageWeight: initialData?.packageWeight || 0,
      packageValue: initialData?.packageValue || 0,
      deliveryFee: initialData?.deliveryFee || 0,
      codAmount: initialData?.codAmount || 0,
      notes: initialData?.notes || '',
    },
  });

  const nextStep = () => setStep((prev) => Math.min(prev + 1, totalSteps));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  const handleFormSubmit = (data: DeliveryFormData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center flex-1">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                s === step
                  ? 'border-primary bg-primary text-primary-foreground'
                  : s < step
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground'
              }`}
            >
              {s}
            </div>
            {s < 4 && (
              <div
                className={`flex-1 h-0.5 mx-2 transition-all ${
                  s < step ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Merchant Selection
            </CardTitle>
            <CardDescription>Select the merchant for this delivery</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="merchantId">Merchant *</Label>
              <Select
                value={watch('merchantId') || 'none'}
                onValueChange={(value) => setValue('merchantId', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select merchant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select merchant</SelectItem>
                  <SelectItem value="merchant-1">ABC Electronics</SelectItem>
                  <SelectItem value="merchant-2">Fashion Hub</SelectItem>
                  <SelectItem value="merchant-3">Tech Store</SelectItem>
                  <SelectItem value="merchant-4">Home Goods Co</SelectItem>
                </SelectContent>
              </Select>
              {errors.merchantId && (
                <p className="text-sm text-destructive">{errors.merchantId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="senderName">Sender Name *</Label>
              <Input id="senderName" {...register('senderName')} placeholder="Enter sender name" />
              {errors.senderName && (
                <p className="text-sm text-destructive">{errors.senderName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="senderPhone">Sender Phone *</Label>
              <Input
                id="senderPhone"
                {...register('senderPhone')}
                placeholder="Enter phone number"
              />
              {errors.senderPhone && (
                <p className="text-sm text-destructive">{errors.senderPhone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="senderAddress">Sender Address *</Label>
              <Textarea
                id="senderAddress"
                {...register('senderAddress')}
                placeholder="Enter full address"
                rows={3}
              />
              {errors.senderAddress && (
                <p className="text-sm text-destructive">{errors.senderAddress.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Recipient Details
            </CardTitle>
            <CardDescription>Enter recipient information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipientName">Recipient Name *</Label>
              <Input
                id="recipientName"
                {...register('recipientName')}
                placeholder="Enter recipient name"
              />
              {errors.recipientName && (
                <p className="text-sm text-destructive">{errors.recipientName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipientPhone">Recipient Phone *</Label>
              <Input
                id="recipientPhone"
                {...register('recipientPhone')}
                placeholder="Enter phone number"
              />
              {errors.recipientPhone && (
                <p className="text-sm text-destructive">{errors.recipientPhone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipientAddress">Recipient Address *</Label>
              <Textarea
                id="recipientAddress"
                {...register('recipientAddress')}
                placeholder="Enter full address"
                rows={3}
              />
              {errors.recipientAddress && (
                <p className="text-sm text-destructive">{errors.recipientAddress.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipientTown">Town *</Label>
              <Input id="recipientTown" {...register('recipientTown')} placeholder="Enter town" />
              {errors.recipientTown && (
                <p className="text-sm text-destructive">{errors.recipientTown.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Package Details
            </CardTitle>
            <CardDescription>Provide package information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="packageDescription">Package Description *</Label>
              <Textarea
                id="packageDescription"
                {...register('packageDescription')}
                placeholder="Describe the package contents"
                rows={3}
              />
              {errors.packageDescription && (
                <p className="text-sm text-destructive">{errors.packageDescription.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="packageWeight">Weight (kg) *</Label>
                <Input
                  id="packageWeight"
                  type="number"
                  step="0.1"
                  {...register('packageWeight', { valueAsNumber: true })}
                  placeholder="0.0"
                />
                {errors.packageWeight && (
                  <p className="text-sm text-destructive">{errors.packageWeight.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="packageValue">Value ($) *</Label>
                <Input
                  id="packageValue"
                  type="number"
                  step="0.01"
                  {...register('packageValue', { valueAsNumber: true })}
                  placeholder="0.00"
                />
                {errors.packageValue && (
                  <p className="text-sm text-destructive">{errors.packageValue.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Any special instructions or notes"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Pricing & Payment
            </CardTitle>
            <CardDescription>Set delivery fee and payment details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deliveryFee">Delivery Fee ($) *</Label>
              <Input
                id="deliveryFee"
                type="number"
                step="0.01"
                {...register('deliveryFee', { valueAsNumber: true })}
                placeholder="0.00"
              />
              {errors.deliveryFee && (
                <p className="text-sm text-destructive">{errors.deliveryFee.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="codAmount">Cash on Delivery Amount ($)</Label>
              <Input
                id="codAmount"
                type="number"
                step="0.01"
                {...register('codAmount', { valueAsNumber: true })}
                placeholder="0.00"
              />
              <p className="text-sm text-muted-foreground">Leave empty if not applicable</p>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h4 className="font-medium">Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package Value:</span>
                  <span className="font-mono">${watch('packageValue')?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Fee:</span>
                  <span className="font-mono">${watch('deliveryFee')?.toFixed(2) || '0.00'}</span>
                </div>
                {Number(watch('codAmount') || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">COD Amount:</span>
                    <span className="font-mono">${watch('codAmount')?.toFixed(2) || '0.00'}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-border font-medium">
                  <span>Total:</span>
                  <span className="font-mono">
                    ${((watch('deliveryFee') || 0) + (watch('codAmount') || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>

        {step < totalSteps ? (
          <Button type="button" onClick={nextStep}>
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button type="submit">Create Delivery</Button>
        )}
      </div>
    </form>
  );
}

const merchantFormSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  contactName: z.string().min(2, 'Contact name is required'),
  contactPhone: z.string().min(10, 'Valid phone number required'),
  contactEmail: z.string().email('Valid email required'),
  address: z.string().min(5, 'Address is required'),
  town: z.string().min(2, 'Town is required'),
  pricingTier: z.enum(['standard', 'premium', 'enterprise']),
});

type MerchantFormData = z.infer<typeof merchantFormSchema>;

interface MerchantFormProps {
  onSubmit: (data: MerchantFormData) => void;
  initialData?: Partial<Merchant>;
}

export function MerchantForm({ onSubmit, initialData }: MerchantFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<MerchantFormData>({
    resolver: zodResolver(merchantFormSchema),
    defaultValues: {
      businessName: initialData?.businessName || '',
      contactName: initialData?.contactName || '',
      contactPhone: initialData?.contactPhone || '',
      contactEmail: initialData?.contactEmail || '',
      address: initialData?.address || '',
      town: initialData?.town || '',
      pricingTier: initialData?.pricingTier || 'standard',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>Enter merchant business details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name *</Label>
            <Input
              id="businessName"
              {...register('businessName')}
              placeholder="Enter business name"
            />
            {errors.businessName && (
              <p className="text-sm text-destructive">{errors.businessName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Business Address *</Label>
            <Textarea
              id="address"
              {...register('address')}
              placeholder="Enter full business address"
              rows={3}
            />
            {errors.address && (
              <p className="text-sm text-destructive">{errors.address.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="town">Town *</Label>
            <Input id="town" {...register('town')} placeholder="Enter town" />
            {errors.town && (
              <p className="text-sm text-destructive">{errors.town.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Primary contact details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Name *</Label>
            <Input
              id="contactName"
              {...register('contactName')}
              placeholder="Enter contact person name"
            />
            {errors.contactName && (
              <p className="text-sm text-destructive">{errors.contactName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone *</Label>
            <Input
              id="contactPhone"
              {...register('contactPhone')}
              placeholder="Enter phone number"
            />
            {errors.contactPhone && (
              <p className="text-sm text-destructive">{errors.contactPhone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email *</Label>
            <Input
              id="contactEmail"
              type="email"
              {...register('contactEmail')}
              placeholder="Enter email address"
            />
            {errors.contactEmail && (
              <p className="text-sm text-destructive">{errors.contactEmail.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing Tier</CardTitle>
          <CardDescription>Select the pricing plan for this merchant</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="pricingTier">Pricing Tier *</Label>
            <Select
              value={watch('pricingTier')}
              onValueChange={(value) =>
                setValue('pricingTier', value as 'standard' | 'premium' | 'enterprise')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Standard</Badge>
                    <span className="text-sm text-muted-foreground">Basic delivery rates</span>
                  </div>
                </SelectItem>
                <SelectItem value="premium">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/10 text-primary">Premium</Badge>
                    <span className="text-sm text-muted-foreground">Discounted rates</span>
                  </div>
                </SelectItem>
                <SelectItem value="enterprise">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-accent text-accent-foreground">Enterprise</Badge>
                    <span className="text-sm text-muted-foreground">Custom pricing</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.pricingTier && (
              <p className="text-sm text-destructive">{errors.pricingTier.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="submit">{initialData ? 'Update Merchant' : 'Add Merchant'}</Button>
      </div>
    </form>
  );
}

const deliverymanFormSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  email: z.string().email('Valid email required'),
  vehicleType: z.enum(['motorcycle', 'van', 'truck']),
  vehicleNumber: z.string().min(3, 'Vehicle number is required'),
  assignedZone: z.string().min(2, 'Assigned zone is required'),
});

type DeliverymanFormData = z.infer<typeof deliverymanFormSchema>;

interface DeliverymanFormProps {
  onSubmit: (data: DeliverymanFormData) => void;
  initialData?: Partial<Deliveryman>;
}

export function DeliverymanForm({ onSubmit, initialData }: DeliverymanFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<DeliverymanFormData>({
    resolver: zodResolver(deliverymanFormSchema),
    defaultValues: {
      name: initialData?.name || '',
      phone: initialData?.phone || '',
      email: initialData?.email || '',
      vehicleType: initialData?.vehicleType || 'motorcycle',
      vehicleNumber: initialData?.vehicleNumber || '',
      assignedZone: initialData?.assignedZone || '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Enter deliveryman personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input id="name" {...register('name')} placeholder="Enter full name" />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input id="phone" {...register('phone')} placeholder="Enter phone number" />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input id="email" type="email" {...register('email')} placeholder="Enter email address" />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Details</CardTitle>
          <CardDescription>Vehicle information for deliveries</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vehicleType">Vehicle Type *</Label>
            <Select
              value={watch('vehicleType')}
              onValueChange={(value) =>
                setValue('vehicleType', value as 'motorcycle' | 'van' | 'truck')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="motorcycle">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    <span>Motorcycle</span>
                  </div>
                </SelectItem>
                <SelectItem value="van">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    <span>Van</span>
                  </div>
                </SelectItem>
                <SelectItem value="truck">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    <span>Truck</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.vehicleType && (
              <p className="text-sm text-destructive">{errors.vehicleType.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicleNumber">Vehicle Number *</Label>
            <Input
              id="vehicleNumber"
              {...register('vehicleNumber')}
              placeholder="Enter vehicle registration number"
            />
            {errors.vehicleNumber && (
              <p className="text-sm text-destructive">{errors.vehicleNumber.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zone Assignment</CardTitle>
          <CardDescription>Delivery zone for this deliveryman</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="assignedZone">Assigned Zone *</Label>
            <Select
              value={watch('assignedZone') || 'none'}
              onValueChange={(value) => setValue('assignedZone', value === 'none' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select zone</SelectItem>
                <SelectItem value="north">North Zone</SelectItem>
                <SelectItem value="south">South Zone</SelectItem>
                <SelectItem value="east">East Zone</SelectItem>
                <SelectItem value="west">West Zone</SelectItem>
                <SelectItem value="central">Central Zone</SelectItem>
              </SelectContent>
            </Select>
            {errors.assignedZone && (
              <p className="text-sm text-destructive">{errors.assignedZone.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="submit">{initialData ? 'Update Deliveryman' : 'Add Deliveryman'}</Button>
      </div>
    </form>
  );
}