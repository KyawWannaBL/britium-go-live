$ErrorActionPreference = "Continue"

$PASSWORD = "P@ssw0rd1"

$headers = @{
  "apikey" = $env:SUPABASE_SERVICE_ROLE_KEY
  "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
  "Content-Type" = "application/json"
}

$accounts = @(
  @{ roleName="Super Admin"; email="testadmin@britiumexpress.com"; roleId="superadmin"; userType="PORTAL" },
  @{ roleName="Marketing"; email="testmarketing@britiumexpress.com"; roleId="marketing"; userType="PORTAL" },
  @{ roleName="Bus. Dev. Manager"; email="testbusiness_development_manager@britiumexpress.com"; roleId="business_development_manager"; userType="PORTAL" },
  @{ roleName="Branch Manager"; email="testbranch_office_manager@britiumexpress.com"; roleId="branch_office_manager"; userType="PORTAL" },
  @{ roleName="Staff"; email="teststaff@britiumexpress.com"; roleId="staff"; userType="PORTAL" },
  @{ roleName="Customer Service"; email="testcustomer_service@britiumexpress.com"; roleId="customer_service"; userType="PORTAL" },
  @{ roleName="Data Entry"; email="testdata_entry@britiumexpress.com"; roleId="data_entry"; userType="PORTAL" },
  @{ roleName="Supervisor"; email="testsupervisor@britiumexpress.com"; roleId="supervisor"; userType="PORTAL" },
  @{ roleName="Warehouse"; email="testwarehouse@britiumexpress.com"; roleId="warehouse"; userType="PORTAL" },
  @{ roleName="Dispatch"; email="testdispatch@britiumexpress.com"; roleId="dispatch"; userType="PORTAL" },
  @{ roleName="Finance"; email="testfinance@britiumexpress.com"; roleId="finance"; userType="PORTAL" },
  @{ roleName="Merchant"; email="testmerchant@britiumexpress.com"; roleId="merchant"; userType="EXTERNAL" },
  @{ roleName="Customer"; email="testcustomer@britiumexpress.com"; roleId="customer"; userType="EXTERNAL" },
  @{ roleName="Rider"; email="testrider@britiumexpress.com"; roleId="rider"; userType="MOBILE" },
  @{ roleName="Driver"; email="testdriver@britiumexpress.com"; roleId="driver"; userType="MOBILE" },
  @{ roleName="Helper"; email="testhelper@britiumexpress.com"; roleId="helper"; userType="MOBILE" }
)

foreach ($a in $accounts) {
  $body = @{
    email = $a.email
    password = $PASSWORD
    email_confirm = $true
    user_metadata = @{
      role_id = $a.roleId
      role_name = $a.roleName
      user_type = $a.userType
      must_change_password = $false
      is_uat_account = $true
    }
    app_metadata = @{
      role_id = $a.roleId
      role_name = $a.roleName
      user_type = $a.userType
      must_change_password = $false
      is_uat_account = $true
    }
  } | ConvertTo-Json -Depth 10

  try {
    $response = Invoke-RestMethod `
      -Method Post `
      -Uri "$env:SUPABASE_URL/auth/v1/admin/users" `
      -Headers $headers `
      -Body $body

    Write-Host "CREATED:" $a.email "=>" $response.id -ForegroundColor Green
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()

    if ($errorBody -match "already" -or $errorBody -match "registered" -or $status -eq 422) {
      Write-Host "EXISTS/SKIPPED:" $a.email -ForegroundColor Yellow
    } else {
      Write-Host "FAILED:" $a.email "STATUS:" $status -ForegroundColor Red
      Write-Host "BODY:" $errorBody
    }
  }

  Start-Sleep -Milliseconds 300
}

Write-Host "REST UAT account seed completed."