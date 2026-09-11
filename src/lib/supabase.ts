import { supabase } from "@/integrations/supabase/client";

export { supabase };
export default supabase;

type Row = Record<string, any>;
type Shipment = Row;
type Delivery = Row;
type Manifest = Row;
type Employee = Row;
type Task = Row;
type Warehouse = Row;
type Branch = Row;
type Vehicle = Row;
type Complaint = Row;
type Attendance = Row;
type LeaveRequest = Row;
type CODCollection = Row;
type Invoice = Row;
type QRCode = Row;

const asArray = <T = Row>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
const num = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

async function requireUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Not authenticated");
  return user;
}

// ============================================================================
// SHIPMENTS API
// ============================================================================

export const shipmentsAPI = {
  async getAll(filters?: {
    status?: string;
    merchantId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let query = supabase
      .from("shipments")
      .select(`
        *,
        merchant:merchant_id(id, full_name, email),
        origin_warehouse:origin_warehouse_id(id, name, code),
        destination_warehouse:destination_warehouse_id(id, name, code)
      `)
      .order("created_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.merchantId) query = query.eq("merchant_id", filters.merchantId);
    if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters?.dateTo) query = query.lte("created_at", filters.dateTo);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Shipment>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("shipments")
      .select(`
        *,
        merchant:merchant_id(id, full_name, email),
        origin_warehouse:origin_warehouse_id(id, name, code),
        destination_warehouse:destination_warehouse_id(id, name, code),
        deliveries(*)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Shipment;
  },

  async getByAWB(awb: string) {
    const { data, error } = await supabase
      .from("shipments")
      .select("*")
      .eq("awb", awb)
      .single();

    if (error) throw error;
    return data as Shipment;
  },

  async create(shipment: Partial<Shipment>) {
    const { data, error } = await supabase
      .from("shipments")
      .insert(shipment)
      .select()
      .single();

    if (error) throw error;
    return data as Shipment;
  },

  async update(id: string, updates: Partial<Shipment>) {
    const { data, error } = await supabase
      .from("shipments")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Shipment;
  },

  async delete(id: string) {
    const { error } = await supabase.from("shipments").delete().eq("id", id);
    if (error) throw error;
  },

  async getStats(merchantId?: string) {
    let query = supabase.from("shipments").select("status, cod_amount, shipping_fee");

    if (merchantId) query = query.eq("merchant_id", merchantId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = asArray<Row>(data);

    return {
      total: rows.length,
      pending: rows.filter((s) => s.status === "pending").length,
      in_transit: rows.filter((s) => s.status === "in_transit").length,
      delivered: rows.filter((s) => s.status === "delivered").length,
      failed: rows.filter((s) => s.status === "failed").length,
      total_cod: rows.reduce((sum, s) => sum + num(s.cod_amount), 0),
      total_revenue: rows.reduce((sum, s) => sum + num(s.shipping_fee), 0),
    };
  },
};

// ============================================================================
// DELIVERIES API
// ============================================================================

export const deliveriesAPI = {
  async getAll(filters?: {
    status?: string;
    driverId?: string;
    manifestId?: string;
  }) {
    let query = supabase
      .from("deliveries")
      .select(`
        *,
        shipment:shipment_id(*),
        driver:driver_id(id, full_name, email),
        manifest:manifest_id(id, manifest_number)
      `)
      .order("created_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.driverId) query = query.eq("driver_id", filters.driverId);
    if (filters?.manifestId) query = query.eq("manifest_id", filters.manifestId);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Delivery>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        *,
        shipment:shipment_id(*),
        driver:driver_id(id, full_name, email),
        manifest:manifest_id(id, manifest_number),
        history:delivery_history(*)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Delivery;
  },

  async create(delivery: Partial<Delivery>) {
    const { data, error } = await supabase
      .from("deliveries")
      .insert(delivery)
      .select()
      .single();

    if (error) throw error;
    return data as Delivery;
  },

  async update(id: string, updates: Partial<Delivery>) {
    const { data, error } = await supabase
      .from("deliveries")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const userId = await requireUserId();

    await supabase.from("delivery_history").insert({
      delivery_id: id,
      shipment_id: data.shipment_id,
      status: (updates as any).status ?? data.status,
      location: (updates as any).current_location ?? null,
      notes: (updates as any).notes ?? null,
      changed_by: userId,
    });

    return data as Delivery;
  },

  async updateStatus(id: string, status: string, location?: any, notes?: string) {
    return this.update(id, {
      status,
      current_location: location,
      notes,
    } as any);
  },

  async markDelivered(
    id: string,
    proof: {
      signature?: any;
      photos?: string[];
      notes?: string;
      location?: any;
    }
  ) {
    return this.update(id, {
      status: "delivered",
      delivered_at: new Date().toISOString(),
      signature: proof.signature,
      photos: proof.photos ?? [],
      notes: proof.notes,
      delivery_location: proof.location,
    } as any);
  },

  async markFailed(id: string, reason: string, category: string, nextAttemptDate?: string) {
    const delivery = await this.getById(id);
    const attemptNumber = Number(delivery.attempt_number ?? 1);

    return this.update(id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: reason,
      failure_category: category,
      attempt_number: attemptNumber + 1,
      ndr_case: {
        attempts: attemptNumber,
        lastAttemptDate: new Date().toISOString(),
        nextAttemptDate: nextAttemptDate || null,
        reason,
        category,
      },
    } as any);
  },
};

// ============================================================================
// MANIFESTS API
// ============================================================================

export const manifestsAPI = {
  async getAll(filters?: {
    status?: string;
    driverId?: string;
    warehouseId?: string;
    date?: string;
  }) {
    let query = supabase
      .from("manifests")
      .select(`
        *,
        driver:driver_id(id, full_name, email),
        vehicle:vehicle_id(id, registration_number, type),
        warehouse:warehouse_id(id, name, code),
        items:manifest_items(
          *,
          shipment:shipment_id(*)
        )
      `)
      .order("scheduled_date", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.driverId) query = query.eq("driver_id", filters.driverId);
    if (filters?.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
    if (filters?.date) query = query.eq("scheduled_date", filters.date);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Manifest>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("manifests")
      .select(`
        *,
        driver:driver_id(id, full_name, email, phone),
        vehicle:vehicle_id(id, registration_number, type, capacity),
        warehouse:warehouse_id(id, name, code, address),
        items:manifest_items(
          *,
          shipment:shipment_id(*)
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Manifest;
  },

  async create(manifest: Partial<Manifest>, shipmentIds: string[]) {
    const { data: manifestData, error: manifestError } = await supabase
      .from("manifests")
      .insert(manifest)
      .select()
      .single();

    if (manifestError) throw manifestError;

    if (shipmentIds.length > 0) {
      const items = shipmentIds.map((shipmentId, index) => ({
        manifest_id: manifestData.id,
        shipment_id: shipmentId,
        sequence_number: index + 1,
        status: "pending",
      }));

      const { error: itemsError } = await supabase.from("manifest_items").insert(items);
      if (itemsError) throw itemsError;
    }

    await supabase
      .from("manifests")
      .update({ total_shipments: shipmentIds.length })
      .eq("id", manifestData.id);

    return manifestData as Manifest;
  },

  async update(id: string, updates: Partial<Manifest>) {
    const { data, error } = await supabase
      .from("manifests")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Manifest;
  },

  async addShipments(manifestId: string, shipmentIds: string[]) {
    const manifest = await this.getById(manifestId);
    const currentCount = asArray<Row>(manifest.items).length;

    if (shipmentIds.length === 0) return;

    const items = shipmentIds.map((shipmentId, index) => ({
      manifest_id: manifestId,
      shipment_id: shipmentId,
      sequence_number: currentCount + index + 1,
      status: "pending",
    }));

    const { error } = await supabase.from("manifest_items").insert(items);
    if (error) throw error;

    await supabase
      .from("manifests")
      .update({ total_shipments: currentCount + shipmentIds.length })
      .eq("id", manifestId);
  },

  async removeShipment(manifestId: string, shipmentId: string) {
    const { error } = await supabase
      .from("manifest_items")
      .delete()
      .eq("manifest_id", manifestId)
      .eq("shipment_id", shipmentId);

    if (error) throw error;

    const manifest = await this.getById(manifestId);
    const nextCount = Math.max(asArray<Row>(manifest.items).length - 1, 0);

    await supabase
      .from("manifests")
      .update({ total_shipments: nextCount })
      .eq("id", manifestId);
  },

  async start(id: string) {
    return this.update(id, {
      status: "in_progress",
      start_time: new Date().toISOString(),
    });
  },

  async complete(id: string) {
    return this.update(id, {
      status: "completed",
      end_time: new Date().toISOString(),
    });
  },
};

// ============================================================================
// EMPLOYEES API
// ============================================================================

export const employeesAPI = {
  async getAll(filters?: { role?: string; status?: string }) {
    let query = supabase.from("user_profiles").select("*").order("full_name");

    if (filters?.role) query = query.eq("role", filters.role);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Employee>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Employee;
  },

  async update(id: string, updates: Partial<Employee>) {
    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Employee;
  },

  async getDrivers(status: string = "active") {
    return this.getAll({ role: "driver", status });
  },
};

// ============================================================================
// WAREHOUSES API
// ============================================================================

export const warehousesAPI = {
  async getAll(type?: string) {
    let query = supabase.from("warehouses").select("*").order("name");

    if (type) query = query.eq("type", type);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Warehouse>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("warehouses")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Warehouse;
  },

  async create(warehouse: Partial<Warehouse>) {
    const { data, error } = await supabase
      .from("warehouses")
      .insert(warehouse)
      .select()
      .single();

    if (error) throw error;
    return data as Warehouse;
  },

  async update(id: string, updates: Partial<Warehouse>) {
    const { data, error } = await supabase
      .from("warehouses")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Warehouse;
  },
};

// ============================================================================
// VEHICLES API
// ============================================================================

export const vehiclesAPI = {
  async getAll(status?: string) {
    let query = supabase
      .from("vehicles")
      .select(`
        *,
        driver:current_driver_id(id, full_name, email),
        warehouse:warehouse_id(id, name, code)
      `)
      .order("registration_number");

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Vehicle>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        *,
        driver:current_driver_id(id, full_name, email),
        warehouse:warehouse_id(id, name, code)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Vehicle;
  },

  async create(vehicle: Partial<Vehicle>) {
    const { data, error } = await supabase
      .from("vehicles")
      .insert(vehicle)
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  },

  async update(id: string, updates: Partial<Vehicle>) {
    const { data, error } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  },

  async assignDriver(vehicleId: string, driverId: string) {
    return this.update(vehicleId, { current_driver_id: driverId } as any);
  },
};

// ============================================================================
// TASKS API
// ============================================================================

export const tasksAPI = {
  async getAll(filters?: {
    assignedTo?: string;
    status?: string;
    priority?: string;
  }) {
    let query = supabase
      .from("tasks")
      .select(`
        *,
        assigned_to_user:assigned_to(id, full_name, email),
        assigned_by_user:assigned_by(id, full_name, email)
      `)
      .order("due_date", { ascending: true });

    if (filters?.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.priority) query = query.eq("priority", filters.priority);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Task>(data);
  },

  async create(task: Partial<Task>) {
    const { data, error } = await supabase
      .from("tasks")
      .insert(task)
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  },

  async update(id: string, updates: Partial<Task>) {
    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  },

  async complete(id: string) {
    return this.update(id, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  },
};

// ============================================================================
// COMPLAINTS API
// ============================================================================

export const complaintsAPI = {
  async getAll(filters?: {
    customerId?: string;
    status?: string;
    assignedTo?: string;
  }) {
    let query = supabase
      .from("complaints")
      .select(`
        *,
        customer:customer_id(id, full_name, email),
        shipment:shipment_id(id, awb),
        assigned_to_user:assigned_to(id, full_name, email)
      `)
      .order("created_at", { ascending: false });

    if (filters?.customerId) query = query.eq("customer_id", filters.customerId);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.assignedTo) query = query.eq("assigned_to", filters.assignedTo);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Complaint>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("complaints")
      .select(`
        *,
        customer:customer_id(id, full_name, email),
        shipment:shipment_id(id, awb),
        assigned_to_user:assigned_to(id, full_name, email),
        messages:complaint_messages(
          *,
          sender:sender_id(id, full_name, email)
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Complaint;
  },

  async create(complaint: Partial<Complaint>) {
    const { data, error } = await supabase
      .from("complaints")
      .insert(complaint)
      .select()
      .single();

    if (error) throw error;
    return data as Complaint;
  },

  async update(id: string, updates: Partial<Complaint>) {
    const { data, error } = await supabase
      .from("complaints")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Complaint;
  },

  async addMessage(complaintId: string, message: string, attachments?: string[]) {
    const userId = await requireUserId();

    const { data, error } = await supabase
      .from("complaint_messages")
      .insert({
        complaint_id: complaintId,
        sender_id: userId,
        message,
        attachments: attachments || [],
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async resolve(id: string, resolution: string) {
    return this.update(id, {
      status: "resolved",
      resolution,
      resolved_at: new Date().toISOString(),
    });
  },
};

// ============================================================================
// ATTENDANCE API
// ============================================================================

export const attendanceAPI = {
  async getAll(filters?: { employeeId?: string; dateFrom?: string; dateTo?: string }) {
    let query = supabase
      .from("attendance")
      .select(`
        *,
        employee:employee_id(id, full_name, email)
      `)
      .order("date", { ascending: false });

    if (filters?.employeeId) query = query.eq("employee_id", filters.employeeId);
    if (filters?.dateFrom) query = query.gte("date", filters.dateFrom);
    if (filters?.dateTo) query = query.lte("date", filters.dateTo);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Attendance>(data);
  },

  async checkIn(location?: any) {
    const userId = await requireUserId();
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("attendance")
      .upsert(
        {
          employee_id: userId,
          date: today,
          check_in: new Date().toISOString(),
          location,
          status: "present",
        },
        { onConflict: "employee_id,date" }
      )
      .select()
      .single();

    if (error) throw error;
    return data as Attendance;
  },

  async checkOut(location?: any) {
    const userId = await requireUserId();
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("attendance")
      .update({
        check_out: new Date().toISOString(),
        location,
      })
      .eq("employee_id", userId)
      .eq("date", today)
      .select()
      .single();

    if (error) throw error;
    return data as Attendance;
  },
};

// ============================================================================
// LEAVE REQUESTS API
// ============================================================================

export const leaveRequestsAPI = {
  async getAll(filters?: { employeeId?: string; status?: string }) {
    let query = supabase
      .from("leave_requests")
      .select(`
        *,
        employee:employee_id(id, full_name, email),
        approved_by_user:approved_by(id, full_name, email)
      `)
      .order("created_at", { ascending: false });

    if (filters?.employeeId) query = query.eq("employee_id", filters.employeeId);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<LeaveRequest>(data);
  },

  async create(leaveRequest: Partial<LeaveRequest>) {
    const { data, error } = await supabase
      .from("leave_requests")
      .insert(leaveRequest)
      .select()
      .single();

    if (error) throw error;
    return data as LeaveRequest;
  },

  async approve(id: string) {
    const userId = await requireUserId();

    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        status: "approved",
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as LeaveRequest;
  },

  async reject(id: string, reason: string) {
    const userId = await requireUserId();

    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        status: "rejected",
        approved_by: userId,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as LeaveRequest;
  },
};

// ============================================================================
// COD COLLECTIONS API
// ============================================================================

export const codCollectionsAPI = {
  async getAll(filters?: {
    driverId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let query = supabase
      .from("cod_collections")
      .select(`
        *,
        driver:driver_id(id, full_name, email),
        shipment:shipment_id(id, awb),
        delivery:delivery_id(id)
      `)
      .order("collected_at", { ascending: false });

    if (filters?.driverId) query = query.eq("driver_id", filters.driverId);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.dateFrom) query = query.gte("collected_at", filters.dateFrom);
    if (filters?.dateTo) query = query.lte("collected_at", filters.dateTo);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<CODCollection>(data);
  },

  async create(collection: Partial<CODCollection>) {
    const { data, error } = await supabase
      .from("cod_collections")
      .insert(collection)
      .select()
      .single();

    if (error) throw error;
    return data as CODCollection;
  },

  async markDeposited(id: string, depositReference: string) {
    const { data, error } = await supabase
      .from("cod_collections")
      .update({
        status: "deposited",
        deposited_at: new Date().toISOString(),
        deposit_reference: depositReference,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as CODCollection;
  },

  async getStats(driverId?: string) {
    let query = supabase.from("cod_collections").select("amount, status");

    if (driverId) query = query.eq("driver_id", driverId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = asArray<Row>(data);

    return {
      total: rows.reduce((sum, c) => sum + num(c.amount), 0),
      collected: rows.filter((c) => c.status === "collected").reduce((sum, c) => sum + num(c.amount), 0),
      deposited: rows.filter((c) => c.status === "deposited").reduce((sum, c) => sum + num(c.amount), 0),
      verified: rows.filter((c) => c.status === "verified").reduce((sum, c) => sum + num(c.amount), 0),
    };
  },
};

// ============================================================================
// INVOICES API
// ============================================================================

export const invoicesAPI = {
  async getAll(filters?: { merchantId?: string; status?: string }) {
    let query = supabase
      .from("invoices")
      .select(`
        *,
        merchant:merchant_id(id, full_name, email)
      `)
      .order("created_at", { ascending: false });

    if (filters?.merchantId) query = query.eq("merchant_id", filters.merchantId);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<Invoice>(data);
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("invoices")
      .select(`
        *,
        merchant:merchant_id(id, full_name, email)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Invoice;
  },

  async create(invoice: Partial<Invoice>) {
    const { data, error } = await supabase
      .from("invoices")
      .insert(invoice)
      .select()
      .single();

    if (error) throw error;
    return data as Invoice;
  },

  async update(id: string, updates: Partial<Invoice>) {
    const { data, error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Invoice;
  },

  async markPaid(id: string, paymentReference: string) {
    return this.update(id, {
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_reference: paymentReference,
    });
  },
};

// ============================================================================
// QR CODES API
// ============================================================================

export const qrCodesAPI = {
  async getAll(filters?: { entityType?: string; isActive?: boolean }) {
    let query = supabase
      .from("qr_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (filters?.entityType) query = query.eq("entity_type", filters.entityType);
    if (filters?.isActive !== undefined) query = query.eq("is_active", filters.isActive);

    const { data, error } = await query;
    if (error) throw error;
    return asArray<QRCode>(data);
  },

  async getByCode(code: string) {
    const { data, error } = await supabase
      .from("qr_codes")
      .select("*")
      .eq("code", code)
      .single();

    if (error) throw error;
    return data as QRCode;
  },

  async create(qrCode: Partial<QRCode>) {
    const { data, error } = await supabase
      .from("qr_codes")
      .insert(qrCode)
      .select()
      .single();

    if (error) throw error;
    return data as QRCode;
  },

  async scan(code: string) {
    const user = await requireUser();

    const current = await this.getByCode(code);
    const nextCount = num(current.scanned_count) + 1;

    const { data, error } = await supabase
      .from("qr_codes")
      .update({
        scanned_count: nextCount,
        last_scanned_at: new Date().toISOString(),
        last_scanned_by: user.id,
      })
      .eq("code", code)
      .select()
      .single();

    if (error) throw error;
    return data as QRCode;
  },

  async deactivate(id: string) {
    const { data, error } = await supabase
      .from("qr_codes")
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as QRCode;
  },
};

// ============================================================================
// ANALYTICS API
// ============================================================================

export const analyticsAPI = {
  async getOverview(dateFrom?: string, dateTo?: string) {
    let shipmentsQuery = supabase
      .from("shipments")
      .select("status, cod_amount, shipping_fee, created_at");

    if (dateFrom) shipmentsQuery = shipmentsQuery.gte("created_at", dateFrom);
    if (dateTo) shipmentsQuery = shipmentsQuery.lte("created_at", dateTo);

    const { data: shipmentsData, error } = await shipmentsQuery;
    if (error) throw error;

    let deliveriesQuery = supabase.from("deliveries").select("status, created_at");

    if (dateFrom) deliveriesQuery = deliveriesQuery.gte("created_at", dateFrom);
    if (dateTo) deliveriesQuery = deliveriesQuery.lte("created_at", dateTo);

    const { data: deliveriesData, error: deliveriesError } = await deliveriesQuery;
    if (deliveriesError) throw deliveriesError;

    const shipments = asArray<Row>(shipmentsData);
    const deliveries = asArray<Row>(deliveriesData);

    return {
      shipments: {
        total: shipments.length,
        pending: shipments.filter((s) => s.status === "pending").length,
        in_transit: shipments.filter((s) => s.status === "in_transit").length,
        delivered: shipments.filter((s) => s.status === "delivered").length,
        failed: shipments.filter((s) => s.status === "failed").length,
      },
      revenue: {
        total: shipments.reduce((sum, s) => sum + num(s.shipping_fee), 0),
        cod: shipments.reduce((sum, s) => sum + num(s.cod_amount), 0),
      },
      deliveries: {
        total: deliveries.length,
        delivered: deliveries.filter((d) => d.status === "delivered").length,
        failed: deliveries.filter((d) => d.status === "failed").length,
      },
    };
  },

  async getRevenueByPeriod(period: "day" | "week" | "month", dateFrom?: string, dateTo?: string) {
    let query = supabase
      .from("shipments")
      .select("shipping_fee, cod_amount, created_at")
      .eq("status", "delivered");

    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data, error } = await query;
    if (error) throw error;

    return {
      period,
      rows: asArray<Row>(data),
    };
  },
};
