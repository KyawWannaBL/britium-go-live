import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const SUPER_ADMIN_META = {
  role: "SUPER_ADMIN",
  roleCode: "SUPER_ADMIN",
  app_role: "SUPER_ADMIN",
  user_role: "SUPER_ADMIN",
};

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local" },
      { status: 500 }
    );
  }

  const superAdmins = [
    {
      email: "md@britiumexpress.com",
      password: "Bv@00899600",
      name: "Managing Director",
    },
    {
      email: "sai@britiumexpress.com",
      password: "Sh@nstar28",
      name: "Sai",
    },
  ];

  const results: any[] = [];

  for (const admin of superAdmins) {
    try {
      const createRes = await supabaseAdmin.auth.admin.createUser({
        email: admin.email,
        password: admin.password,
        email_confirm: true,
        user_metadata: {
          full_name: admin.name,
          ...SUPER_ADMIN_META,
        },
      });

      let userId = createRes.data?.user?.id;
      let userMeta = createRes.data?.user?.user_metadata || {};

      if (createRes.error && createRes.error.message.includes("already registered")) {
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users.find((u) => u.email === admin.email);

        if (existingUser) {
          userId = existingUser.id;
          userMeta = existingUser.user_metadata || {};

          const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: admin.password,
            email_confirm: true,
            user_metadata: {
              ...userMeta,
              full_name: admin.name,
              ...SUPER_ADMIN_META,
            },
          });

          if (updateAuthError) throw updateAuthError;
        }
      } else if (createRes.error) {
        throw createRes.error;
      }

      if (userId) {
        const { error: updateProfileError } = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              id: userId,
              role: "SYS",
              full_name: admin.name,
            },
            { onConflict: "id" }
          );

        if (updateProfileError) throw updateProfileError;
      }

      results.push({
        email: admin.email,
        status: "Success",
        profileRole: "SYS",
        displayRole: "SUPER_ADMIN",
      });
    } catch (error: any) {
      results.push({
        email: admin.email,
        status: "Failed",
        error: error.message,
      });
    }
  }

  return NextResponse.json({
    message: "Super Admin Provisioning Complete",
    results,
  });
}