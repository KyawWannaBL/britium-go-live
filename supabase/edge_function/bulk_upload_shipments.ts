import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface ShipmentRow {
  awb?: string;
  service_type: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  sender_city: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_city: string;
  recipient_postal_code?: string;
  weight: number;
  length?: number;
  width?: number;
  height?: number;
  declared_value?: number;
  cod_amount?: number;
  payment_method: string;
  special_instructions?: string;
}

function generateAWB(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BE${timestamp}${random}`;
}

function parseCSV(csvText: string): ShipmentRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must contain header and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows: ShipmentRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row as ShipmentRow);
  }

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    // Check permissions
    if (!['merchant', 'data-entry', 'admin', 'super-admin', 'branch-office'].includes(profile.role)) {
      throw new Error('Insufficient permissions');
    }

    const { csvData } = await req.json();
    
    if (!csvData) {
      throw new Error('Missing CSV data');
    }

    const rows = parseCSV(csvData);
    const results = {
      total: rows.length,
      successful: 0,
      failed: 0,
      errors: [] as any[],
    };

    // Get default warehouse
    const { data: warehouse } = await supabaseClient
      .from('warehouses')
      .select('id')
      .eq('type', 'hub')
      .limit(1)
      .single();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const shipment = {
          awb: row.awb || generateAWB(),
          merchant_id: profile.role === 'merchant' ? user.id : profile.id,
          service_type: row.service_type || 'standard',
          status: 'pending',
          sender: {
            name: row.sender_name,
            phone: row.sender_phone,
            address: row.sender_address,
            city: row.sender_city,
          },
          recipient: {
            name: row.recipient_name,
            phone: row.recipient_phone,
            address: row.recipient_address,
            city: row.recipient_city,
            postalCode: row.recipient_postal_code || '',
          },
          package_details: {
            weight: parseFloat(row.weight.toString()) || 0,
            dimensions: {
              length: parseFloat(row.length?.toString() || '0'),
              width: parseFloat(row.width?.toString() || '0'),
              height: parseFloat(row.height?.toString() || '0'),
            },
          },
          declared_value: row.declared_value ? parseFloat(row.declared_value.toString()) : null,
          cod_amount: row.cod_amount ? parseFloat(row.cod_amount.toString()) : null,
          payment_method: row.payment_method || 'prepaid',
          payment_status: 'pending',
          origin_warehouse_id: warehouse?.id || null,
          special_instructions: row.special_instructions || null,
          created_by: user.id,
        };

        const { error: insertError } = await supabaseClient
          .from('shipments')
          .insert(shipment);

        if (insertError) {
          throw insertError;
        }

        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: i + 2,
          data: row,
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});